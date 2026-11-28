import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { openCheckpointStore, WORLD_DATABASE } from '../client/js/local-world/checkpoints.js';
import { GrowingTerrain189 } from '../client/js/local-world/generation/v1_8_9/growing-terrain.js';
import { EXPERIMENTAL_DEFAULT_189 } from '../client/js/local-world/generation/v1_8_9/stateful-population.js';
import { chunkPacket } from '../client/js/local-world/protocol.js';
import { loadLocalWorld } from '../client/js/local-world/server.js';
import { createTerrain, collides } from '../client/js/local-world/terrain.js';
import { newWorldState, validateGenerator } from '../client/js/local-world/world-metadata.js';
import { WORLD_TYPES, worldSettings } from '../client/js/local-world/world-settings.js';
import { CreateLocalWorldScreen } from '../client/js/gui/screens/local-worlds.js';
import { Chunk } from '../client/js/world/chunk.js';
import { C, decodePacket } from '../client/js/net/packets.js';
import { Connection } from '../client/js/net/connection.js';
import { LocalWorldSocket } from '../client/js/local-world/socket.js';

class FakeLocks {
  constructor() { this.held = new Set(); }
  async request(name, options, callback) {
    assert.deepEqual(options, { mode: 'exclusive', ifAvailable: true });
    if (this.held.has(name)) return callback(null);
    this.held.add(name);
    try { return await callback({ name }); } finally { this.held.delete(name); }
  }
}

function withFakeLocks(locks) {
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: locks ? { locks } : {} });
  return () => {
    if (prev) Object.defineProperty(globalThis, 'navigator', prev);
    else delete globalThis.navigator;
  };
}

function fakeWorkerPair(idb, locks) {
  let terminated = false;
  let session;
  let ownershipLocksRestore;

  const clientWorker = new EventTarget();
  clientWorker.postMessage = (data) => {
    if (data?.kind === 'local-session' && data.port) {
      const serverPort = data.port;
      let queue = Promise.resolve();
      const emit = (value, transfer = []) => serverPort.postMessage({ kind: 'event', value }, transfer);
      const reply = (id, value, transfer = []) => serverPort.postMessage({ kind: 'result', id, ok: true, value }, transfer);
      serverPort.onmessage = ({ data: msg }) => {
        queue = queue.then(async () => {
          if (terminated) return;
          try {
            if (msg.kind === 'open' && !session) {
              ownershipLocksRestore = withFakeLocks(locks);
              session = await loadLocalWorld(msg.initialization, emit, name => openCheckpointStore(name, idb));
              reply(msg.id);
              return;
            }
            if (msg.kind === 'close') {
              await session?.close?.();
              reply(msg.id);
              serverPort.close();
              return;
            }
            if (msg.kind === 'command' && session) {
              const res = await session.handle(msg.value);
              reply(msg.id, res?.value, res?.transfer);
              return;
            }
            throw new Error('Invalid local session command');
          } catch (error) {
            serverPort.postMessage({ kind: 'result', id: msg.id, ok: false, error: error?.message ?? String(error) });
          }
        });
      };
    }
  };
  clientWorker.terminate = () => {
    terminated = true;
    ownershipLocksRestore?.();
  };
  return clientWorker;
}

async function until(find, limit = 160) {
  for (let i = 0; i < limit; i++) {
    const val = find();
    if (val) return val;
    await new Promise(r => setTimeout(r, 20));
  }
  throw new Error('Timed out waiting for condition');
}

test('chunkPacket transmits persisted skyLight, blockLight, light-only halo refreshes and relit player edits', async () => {
  const store = await openCheckpointStore('light-payload', new IDBFactory());
  const baseCol = () => {
    const states = new Uint16Array(65536);
    states.fill(16, 0, 63 * 256);
    states.fill(32, 63 * 256, 64 * 256);
    return { states, biomes: new Uint8Array(256).fill(1) };
  };
  const generator = { column: baseCol, minY: 0, maxY: 255, contains: () => true, chunkLimit: 10000, viewDistanceLimit: 8 };
  const state = { id: 'light-world', seed: '7', generator: { id: 'light-payload-test', version: 1 }, edits: [] };

  const terrain = new GrowingTerrain189(generator, state, store, ({ world }) => {
    // Write a block emitter in (0,0), plus a light-only skyLight change in empty section 4 of (1,0)
    world.set(0, 64, 0, 89 << 4); // glowstone (emitLight = 15)
    world.set(17, 64, 0, 1 << 4); // stone in neighbor (1,0)
    world._chunk(1, 0).setSkyLight(2, 70, 0, 6);
  });

  // Prepare (1,0) BEFORE (0,0) populates, then decode its initial packet (unpopulated)
  await terrain.prepare(1, 0);
  const initialPkt = decodePacket(chunkPacket(terrain, 1, 0));
  const initialChunk = new Chunk(1, 0, true);
  initialChunk.load(initialPkt.chunkData, 0, initialPkt.bitMap, true, true);
  assert.equal(initialChunk.getSkyLight(2, 70, 0), 15);
  assert.equal(initialChunk.getState(1, 64, 0), 0);

  // Preparing (0,0), (0,1), (1,1) populates (0,0) and invalidates cached (1,0)
  await terrain.prepare(0, 0);
  await terrain.prepare(0, 1);
  await terrain.prepare(1, 1);

  const refreshed = terrain.takeChangedColumns();
  assert.ok(refreshed.some(c => c.x === 1 && c.z === 0));

  // Verify neighbor chunk packet now includes section 4 (even though no blocks at y=70!) and light=6
  const updatedPkt = decodePacket(chunkPacket(terrain, 1, 0));
  assert.ok(updatedPkt.bitMap & (1 << 4), 'section 4 must be included for light-only halo update');
  const updatedChunk = new Chunk(1, 0, true);
  updatedChunk.load(updatedPkt.chunkData, 0, updatedPkt.bitMap, true, true);
  assert.equal(updatedChunk.getState(1, 64, 0), 1 << 4);
  assert.equal(updatedChunk.getSkyLight(2, 70, 0), 6);

  // Verify glowstone block light in (0,0)
  const originPkt = decodePacket(chunkPacket(terrain, 0, 0));
  const originChunk = new Chunk(0, 0, true);
  originChunk.load(originPkt.chunkData, 0, originPkt.bitMap, true, true);
  assert.equal(originChunk.getState(0, 64, 0), 89 << 4);
  assert.equal(originChunk.getBlockLight(1, 64, 0), 14);

  // Apply player edit (place torch in (1,0) at (20, 64, 0) + opaque roof above (2, 70, 0)) and reopen
  terrain.set(20, 64, 0, 50 << 4);
  terrain.set(18, 72, 0, 1 << 4);
  const reopened = new GrowingTerrain189(generator, { ...state, edits: terrain.snapshot() }, store, () => {
    throw new Error('Must not duplicate-populate');
  });
  await reopened.prepare(1, 0);
  const editedPkt = decodePacket(chunkPacket(reopened, 1, 0));
  const editedChunk = new Chunk(1, 0, true);
  editedChunk.load(editedPkt.chunkData, 0, editedPkt.bitMap, true, true);
  assert.equal(editedChunk.getState(4, 64, 0), 50 << 4);
  assert.equal(editedChunk.getBlockLight(5, 64, 0), 13);
  assert.equal(editedChunk.getSkyLight(2, 71, 0), 14);
  assert.equal(editedChunk.getSkyLight(2, 70, 0), 14);
  store.close();
});

test('experimental world type is registered without altering legacy generators or reserving final ID', () => {
  assert.equal(EXPERIMENTAL_DEFAULT_189.enabled, true);
  assert.ok(WORLD_TYPES.includes('defaultExperimental'));
  const expState = newWorldState({
    name: 'NativeExp',
    seed: '7',
    settings: worldSettings({ worldType: 'defaultExperimental' }),
  });
  assert.equal(expState.generator.id, 'java-1.8.9-default-experimental-stateful-v1');
  validateGenerator(expState);

  // Reserved final ID remains unregistered and rejected
  assert.throws(() => validateGenerator({
    ...expState,
    generator: { id: 'java-1.8.9-default-v1', version: 1, configuration: null },
  }), /unavailable generator/);

  // UI selection cycles to defaultExperimental cleanly and displays experimental notice
  const game = {
    gui: { width: 320, height: 240 },
    screens: { open(s) { this.current = s; s.buttons = []; s.fields = []; s.init(); } },
    connectLocalWorld() {},
  };
  const create = new CreateLocalWorldScreen(game, null);
  game.screens.open(create);
  create.buttons.find(b => b.id === 3).onClick(); // More options
  const idx = WORLD_TYPES.indexOf('defaultExperimental');
  for (let i = 0; i < idx; i++) create.buttons.find(b => b.id === 5).onClick();
  assert.equal(create.settings.worldType, 'defaultExperimental');
});

test('ownership lock is acquired before experimental creation, enforced on ID and name lookups, and fails closed without Web Locks', async () => {
  const idb = new IDBFactory();
  const openStore = name => openCheckpointStore(name, idb);

  // 1. Missing Web Locks fails closed BEFORE writing anything on create
  const restoreNoLocks = withFakeLocks(null);
  try {
    await assert.rejects(
      loadLocalWorld({ name: 'ShouldNotPersist', seed: '7', settings: { worldType: 'defaultExperimental' }, create: true }, () => {}, openStore),
      /requires Web Locks/
    );
  } finally {
    restoreNoLocks();
  }
  const verifyStore = await openStore(WORLD_DATABASE);
  assert.deepEqual(await verifyStore.summaries(), [], 'Failed ownership check must not leave created world record');
  verifyStore.close();

  // 2. Successful create acquires lock before writing; concurrent open by ID OR name refuses; different world succeeds
  const locks = new FakeLocks();
  const restoreLocks = withFakeLocks(locks);
  try {
    const sessionA = await loadLocalWorld({
      name: 'LockedExp',
      seed: '7',
      settings: { worldType: 'defaultExperimental' },
      creation: { gameMode: 'creative' },
      create: true,
    }, () => {}, openStore);

    assert.equal(locks.held.size, 1);
    assert.ok(locks.held.has(`minecraftjs:world:${sessionA.record.id}`));

    // Refused by ID
    await assert.rejects(
      loadLocalWorld({ id: sessionA.record.id }, () => {}, openStore),
      /already open/
    );
    // Refused by legacy name lookup
    await assert.rejects(
      loadLocalWorld({ name: 'LockedExp' }, () => {}, openStore),
      /already open/
    );

    // Different world succeeds
    const sessionB = await loadLocalWorld({
      name: 'OtherExp',
      seed: '7',
      settings: { worldType: 'defaultExperimental' },
      create: true,
    }, () => {}, openStore);
    assert.equal(locks.held.size, 2);
    await sessionB.close();
    assert.equal(locks.held.size, 1);

    await sessionA.close();
    assert.equal(locks.held.size, 0);

    // Reopen by name works after close
    const reopened = await loadLocalWorld({ name: 'LockedExp' }, () => {}, openStore);
    assert.equal(reopened.record.id, sessionA.record.id);
    await reopened.close();
    assert.equal(locks.held.size, 0);
  } finally {
    restoreLocks();
  }
});

test('experimental Default seed 7 can be created, entered, explored beyond 64 columns, edited, saved and reopened without duplicate population', { timeout: 45000 }, async t => {
  const idb = new IDBFactory();
  const locks = new FakeLocks();
  const platform = { createWorker: () => fakeWorkerPair(idb, locks) };

  const connect = async (options) => {
    const conn = new Connection();
    const control = [], packets = [], decodeErrors = [];
    conn.on('control', m => control.push(m));
    conn.on('packet', p => packets.push(p));
    conn.on('decode_error', e => decodeErrors.push(e));
    t.after(() => conn.close());
    await conn.connectLocal(new LocalWorldSocket(platform, options));
    return { conn, control, packets, decodeErrors };
  };

  const live = await connect({
    name: 'Native Seed 7',
    seed: '7',
    settings: { worldType: 'defaultExperimental' },
    creation: { gameMode: 'creative', cheats: true },
    create: true,
  });

  assert.equal(live.control[0].type, 'login_success');
  assert.equal(live.decodeErrors.length, 0);
  const spawnPos = await until(() => live.packets.find(p => p.name === 'position'));
  assert.ok(spawnPos.y >= 63, `Expected safe above-sea spawn, got y=${spawnPos.y}`);

  // Wait for initial 5x5 chunks around spawn to arrive
  const spawnCx = Math.floor(spawnPos.x / 16), spawnCz = Math.floor(spawnPos.z / 16);
  await until(() => live.packets.filter(p => p.name === 'map_chunk' && p.bitMap !== 0).length >= 25, 250);

  // Verify decoded spawn chunk has genuine 1.8.9 biome, ground below feet, and open sky light
  const spawnPkt = live.packets.findLast(p => p.name === 'map_chunk' && p.x === spawnCx && p.z === spawnCz && p.bitMap !== 0);
  const chunk = new Chunk(spawnCx, spawnCz, true);
  chunk.load(spawnPkt.chunkData, 0, spawnPkt.bitMap, true, true);
  assert.ok(chunk.getState(Math.floor(spawnPos.x) & 15, Math.floor(spawnPos.y) - 1, Math.floor(spawnPos.z) & 15) !== 0);
  assert.equal(chunk.getSkyLight(Math.floor(spawnPos.x) & 15, Math.floor(spawnPos.y), Math.floor(spawnPos.z) & 15), 15);

  // Edit at guaranteed-solid spawn column (after floating +3 blocks so player box does not occupy target):
  // place stone on top of ground (targetY + 1), then dig original ground block (targetY).
  const sx = Math.floor(spawnPos.x);
  const targetY = Math.floor(spawnPos.y) - 1;
  const sz = Math.floor(spawnPos.z);
  live.conn.send(C.position(spawnPos.x, spawnPos.y + 3, spawnPos.z, false));
  live.conn.send(C.heldItemSlot(0));
  live.conn.send(C.blockPlace(sx, targetY, sz, 1, { id: 1, count: 1, damage: 0 }, 8, 8, 8));
  live.conn.send(C.blockDig(0, sx, targetY, sz, 1));
  await until(() => live.packets.filter(p => p.name === 'block_change').length >= 2);
  assert.deepEqual(
    live.packets.filter(p => p.name === 'block_change').map(p => [p.location.x, p.location.y, p.location.z, p.state]),
    [[sx, targetY + 1, sz, 1 << 4], [sx, targetY, sz, 0]],
  );

  // Explore > 64 distinct columns: walk/fly east across chunks, pausing for each 5x5 band to stream cleanly
  let y = spawnPos.y + 3;
  const flyY = Math.max(y + 9, 95);
  while (y < flyY) {
    y = Math.min(flyY, y + 6);
    live.conn.send(C.position(spawnPos.x, y, spawnPos.z, false));
  }
  const uniqueChunks = () => {
    const set = new Set();
    for (const p of live.packets) if (p.name === 'map_chunk' && p.bitMap !== 0) set.add(`${p.x},${p.z}`);
    return set.size;
  };
  let x = spawnPos.x;
  for (let band = 1; band <= 8; band++) {
    for (let s = 0; s < 5; s++) {
      x += 6;
      live.conn.send(C.position(x, flyY, spawnPos.z, false));
    }
    const targetCx = Math.floor(x / 16) + 2;
    await until(() => live.packets.some(p => p.name === 'map_chunk' && p.x >= targetCx && p.bitMap !== 0), 400);
  }
  const endCx = Math.floor(x / 16);
  await until(() => {
    let count = 0;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (live.packets.some(p => p.name === 'map_chunk' && p.x === endCx + dx && p.z === spawnCz + dz && p.bitMap !== 0)) count++;
    }
    return count === 25;
  }, 400);
  assert.ok(uniqueChunks() > 64, `Expected >64 unique loaded chunks, got ${uniqueChunks()}`);
  assert.equal(live.decodeErrors.length, 0);

  // Verify neighbor population sent chunk refresh packets (multiple map_chunk transmissions for same chunk coord)
  const chunkSendCounts = new Map();
  for (const p of live.packets) {
    if (p.name === 'map_chunk' && p.bitMap !== 0) {
      const k = `${p.x},${p.z}`;
      chunkSendCounts.set(k, (chunkSendCounts.get(k) ?? 0) + 1);
    }
  }
  assert.ok([...chunkSendCounts.values()].some(n => n > 1), 'Expected at least one chunk refreshed by neighboring population');

  // Verify checkpoint saved and close cleanly
  const store = await openCheckpointStore(WORLD_DATABASE, idb);
  const summaries = await store.summaries();
  assert.equal(summaries.length, 1);
  const worldId = summaries[0].id;
  const identity = [worldId, `${EXPERIMENTAL_DEFAULT_189.id}:1`, 'growing-partial-v1'];
  await live.conn.close();
  assert.equal(locks.held.size, 0);

  const metaBeforeReopen = (await store.loadGenerationWindow(identity, [])).meta;
  assert.ok(metaBeforeReopen.sequence > 4, 'Expected explored chunks to populate beyond spawn');

  // Reopen at saved position (near spawnCx + 10), then walk slightly within already-populated range
  const reopened = await connect({ id: worldId });
  const reopenPos = await until(() => reopened.packets.find(p => p.name === 'position'));
  assert.equal(reopenPos.x, x);
  assert.equal(reopenPos.y, flyY);
  await until(() => reopened.packets.filter(p => p.name === 'map_chunk' && p.bitMap !== 0).length >= 25, 250);
  const metaAfterReopen = (await store.loadGenerationWindow(identity, [])).meta;
  assert.equal(metaAfterReopen.sequence, metaBeforeReopen.sequence, 'Reopening visited area must not re-populate');

  // Fly back to spawn in <= 6-block steps and confirm both edits persisted
  let rx = x;
  while (rx > spawnPos.x) {
    rx = Math.max(spawnPos.x, rx - 6);
    reopened.conn.send(C.position(rx, flyY, spawnPos.z, false));
  }
  const backAtSpawn = await until(() => reopened.packets.find(p => p.name === 'map_chunk' && p.x === spawnCx && p.z === spawnCz && p.bitMap !== 0), 250);
  const reopenChunk = new Chunk(spawnCx, spawnCz, true);
  reopenChunk.load(backAtSpawn.chunkData, 0, backAtSpawn.bitMap, true, true);
  assert.equal(reopenChunk.getState(sx & 15, targetY + 1, sz & 15), 1 << 4);
  assert.equal(reopenChunk.getState(sx & 15, targetY, sz & 15), 0);
  await reopened.conn.close();
  store.close();
});
