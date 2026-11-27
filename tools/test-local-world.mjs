import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { Game } from '../client/js/game/game.js';
import { loadLocalWorld } from '../client/js/local-world/server.js';
import { serveLocalSession } from '../client/js/local-world/session.js';
import { LocalWorldSocket } from '../client/js/local-world/socket.js';
import { TerraceTerrain, createTerrain, collides, seedNumber } from '../client/js/local-world/terrain.js';
import { describeWorld, resolveSeed, seedWords, worldSettings } from '../client/js/local-world/world-settings.js';
import { chunkPacket } from '../client/js/local-world/protocol.js';
import { resolveJavaSeed } from '../client/js/local-world/java-random.js';
import { CreateLocalWorldScreen } from '../client/js/gui/screens/local-worlds.js';
import { Connection } from '../client/js/net/connection.js';
import { C, decodePacket } from '../client/js/net/packets.js';
import { Chunk } from '../client/js/world/chunk.js';

function fileStore(file) {
  async function load(id) {
    try {
      const record = JSON.parse(await readFile(file, 'utf8'));
      return record.id === id ? record : undefined;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return undefined;
    }
  }
  async function write(record) {
    await writeFile(file, JSON.stringify(record));
    return { id: record.id, revision: record.revision };
  }
  return {
    load,
    async createWorld(state) {
      const meta = await this.create(state.id, state);
      return { ...meta, state };
    },
    async loadChunk(worldId, x, z) {
      try {
        const record = JSON.parse(await readFile(file + '.' + x + '.' + z, 'utf8'));
        record.states = Uint16Array.from(record.states);
        record.biomes = Uint8Array.from(record.biomes);
        return record.worldId === worldId ? record : undefined;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return undefined;
      }
    },
    async saveChunk(record) {
      await writeFile(file + '.' + record.x + '.' + record.z, JSON.stringify({
        ...record, states: [...record.states], biomes: [...record.biomes],
      }));
      return record;
    },
    async create(id, state) {
      if (await load(id)) throw new DOMException('Duplicate', 'ConstraintError');
      return write({ id, revision: 1, state });
    },
    async save(id, revision, state) {
      assert.equal((await load(id))?.revision, revision);
      return write({ id, revision: revision + 1, state });
    },
    close() {},
  };
}

if (!isMainThread) {
  const scope = new EventTarget();
  parentPort.on('message', data => scope.dispatchEvent(new MessageEvent('message', { data })));
  serveLocalSession(scope, (options, emit) => loadLocalWorld(options, emit, () => fileStore(workerData.file)));
} else {
  test('Singleplayer opens the world picker and canceling prevents late worker startup', async () => {
    const { TitleScreen } = await import('../client/js/gui/screens/menus.js');
    const screens = { open(screen) { this.current = screen; } };
    const game = {
      assets: {},
      screens,
      gui: { width: 320, height: 220 },
      accounts: { active() { assert.fail('Local session accessed an account'); } },
      disconnect: Game.prototype.disconnect,
      bindConnection: Game.prototype.bindConnection,
      leaveWorld() {},
      reset() {},
    };
    const title = new TitleScreen(game);
    title.init();
    const singleplayer = title.buttons.find(button => button.id === 1);
    assert.equal(singleplayer.enabled, true);
    singleplayer.onClick();
    assert.equal(screens.current.constructor.name, 'LocalWorldsScreen');

    // Cancel before the previous world finishes closing. No worker may attach late.
    let finish;
    game.localWorldClose = new Promise(resolve => { finish = resolve; });
    const ready = Game.prototype.connectLocalWorld.call(game, { name: 'Terrace' });
    game.disconnect(true);
    finish();
    await ready;
    assert.equal(game.conn, null);
  });

  test('workers exchange protocol 47 frames, stream terrain, validate edits and reopen a checkpoint',
    { timeout: 8000 }, async t => {
      const directory = await mkdtemp(join(tmpdir(), 'local-world-test-'));
      const file = join(directory, 'terrace.json');
      t.after(() => rm(directory, { recursive: true, force: true }));
      const platform = { createWorker: () => nodeWorker(file) };
      const live = await connect(t, platform, { name: 'Terrace', seed: 'plateaus', settings: { worldType: 'terraces' }, create: true });
      assert.equal(live.control[0].type, 'login_success');
      assert.equal(live.control[0].username, 'Builder');
      assert.deepEqual(live.packets.map(p => p.name).slice(0, 5), ['login', 'update_time', 'spawn_position', 'update_health', 'abilities']);

      const first = live.packets.find(p => p.name === 'map_chunk');
      assert.equal(first.x, 0);
      assert.equal(first.z, 0);
      const chunk = new Chunk(first.x, first.z, true);
      assert.equal(chunk.load(first.chunkData, 0, first.bitMap, true, true), first.chunkData.length);
      assert.equal(chunk.getState(0, 55, 0), 98 << 4);
      assert.equal(chunk.getState(0, 56, 0), 0);
      assert.equal(chunk.getSkyLight(0, 56, 0), 15);

      live.conn.send(C.position(1.5, 57, 0.5, false));
      live.conn.send(C.position(1.5, 54, 0.5, false));
      const correction = await until(() => live.packets.filter(p => p.name === 'position')[1]);
      assert.deepEqual([correction.x, correction.y, correction.z], [1.5, 57, 0.5]);

      live.conn.send(C.heldItemSlot(3));
      live.conn.send(C.blockPlace(2, 55, 0, 1, { id: 1, count: 1, damage: 0 }, 8, 8, 8));
      live.conn.send(C.blockDig(0, 3, 55, 0, 1));
      const edits = await until(() => {
        const changes = live.packets.filter(p => p.name === 'block_change');
        return changes.length === 2 && changes;
      });
      assert.deepEqual(edits.map(p => [p.location.x, p.location.y, p.state]), [[2, 56, 35 << 4], [3, 55, 0]]);
      assert.equal(JSON.parse(await readFile(file, 'utf8')).revision, 3);

      await until(() => live.packets.some(p => p.name === 'map_chunk' && p.x === -2));
      for (const x of [6.5, 12.5, 18.5]) live.conn.send(C.position(x, 61, 0.5, false));
      await until(() => live.packets.some(p => p.name === 'map_chunk' && p.x === -2 && p.bitMap === 0));
      await until(() => live.packets.some(p => p.name === 'map_chunk' && p.x === 3 && p.bitMap !== 0));
      assert.equal(live.packets.filter(p => p.name === 'position').length, 2);
      assert.ok(live.conn.bytesIn >= first.chunkData.length);
      assert.ok(live.conn.bytesOut > 0);
      assert.equal(live.decodeErrors.length, 0);
      const metrics = await until(() => live.conn.ws.metrics);
      assert.ok(metrics.chunkCount >= 25);
      assert.ok(metrics.peakTickMs >= 0);
      assert.equal(metrics.saves, 2);
      await live.conn.close();

      const reopened = await connect(t, platform, { id: JSON.parse(await readFile(file, 'utf8')).id });
      const position = reopened.packets.find(p => p.name === 'position');
      assert.deepEqual([position.x, position.y, position.z], [18.5, 61, 0.5]);
      const loaded = await until(() => reopened.packets.find(p => p.name === 'map_chunk' && p.x === 0 && p.z === 0));
      chunk.load(loaded.chunkData, 0, loaded.bitMap, true, true);
      assert.equal(chunk.getState(2, 56, 0), 35 << 4);
      assert.equal(chunk.getState(3, 55, 0), 0);
      await reopened.conn.close();

      const saved = JSON.parse(await readFile(file, 'utf8'));
      assert.equal(saved.state.displayName, 'Terrace');
      assert.equal(saved.state.generator.id, 'terraces-v1');
    });

  test('seeded terrain is independent of chunk request order and edits restore the base', () => {
    const coordinates = [[-19, -19], [19, 19], [19, -19], [-19, 19], [43, 43], [6, 6]];
    const terrain = new TerraceTerrain(seedNumber('plateaus'));
    const duplicate = new TerraceTerrain(seedNumber('plateaus'));
    const heights = coordinates.map(([x, z]) => terrain.surface(x, z));
    assert.deepEqual(heights, [...coordinates].reverse().map(([x, z]) => duplicate.surface(x, z)).reverse());
    const different = new TerraceTerrain(seedNumber('hills'));
    assert.notDeepEqual(heights, coordinates.map(([x, z]) => different.surface(x, z)));
    const base = terrain.get(0, 55, 0);
    terrain.set(0, 55, 0, 0);
    assert.equal(terrain.get(0, 55, 0), 0);
    terrain.set(0, 55, 0, base);
    assert.deepEqual(terrain.snapshot(), []);
  });

  test('world creation retains its fields and mode-dependent defaults across pages', () => {
    let options;
    const game = {
      gui: { width: 320, height: 240 },
      screens: { open(screen) { this.current = screen; screen.buttons = []; screen.fields = []; screen.init(); } },
      connectLocalWorld(value) { options = value; },
    };
    const create = new CreateLocalWorldScreen(game, null);
    game.screens.open(create);
    assert.equal(create.creation.gameMode, 'survival');
    create.nameField.setText('Mountain workshop');
    create.buttons.find(b => b.id === 2).onClick(); // Hardcore
    create.buttons.find(b => b.id === 3).onClick();
    assert.equal(create.buttons.find(b => b.id === 6).enabled, false);
    assert.equal(create.buttons.find(b => b.id === 7).enabled, false);
    create.seedField.setText('-9223372036854775808');
    create.buttons.find(b => b.id === 8).onClick();
    create.buttons.find(b => b.id === 2).onClick(); // Creative
    assert.equal(create.creation.cheats, true);
    create.buttons.find(b => b.id === 3).onClick();
    create.buttons.find(b => b.id === 6).onClick(); // Explicit cheats override.
    create.buttons.find(b => b.id === 5).onClick(); // Flat
    assert.equal(create.settings.worldType, 'flat');
    create.buttons.find(b => b.id === 9).onClick();
    const layers = game.screens.current;
    layers.count.setText('2');
    layers.buttons.find(b => b.id === 0).onClick();
    assert.equal(game.screens.current, create);
    assert.equal(create.flat.layers.at(-1).count, 2);
    create.buttons.find(b => b.id === 8).onClick();
    create.buttons.find(b => b.id === 2).onClick(); // Survival, retains override.
    create.buttons.find(b => b.id === 2).onClick(); // Hardcore
    create.buttons.find(b => b.id === 2).onClick(); // Creative
    assert.equal(create.creation.cheats, false);
    create.buttons.find(b => b.id === 0).onClick();
    assert.equal(options.name, 'Mountain workshop');
    assert.equal(options.seed, '-9223372036854775808');
    assert.equal(options.creation.cheats, false);
    assert.equal(options.settings.worldType, 'flat');
    assert.equal(options.flat.layers.at(-1).count, 2);
  });

  test('custom elevation and water level affect generated columns, and flooded worlds have clear spawn space', () => {
    const base = { version: 2, seed: 'custom', edits: [] };
    const dry = createTerrain({ ...base, settings: worldSettings({ worldType: 'custom', baseHeight: 136, relief: 2, waterLevel: 16 }) });
    const wet = createTerrain({ ...base, settings: worldSettings({ worldType: 'custom', baseHeight: 32, relief: 2, waterLevel: 112 }) });
    assert.ok(dry.surface(0, 0) > wet.surface(0, 0) + 80);
    assert.equal(wet.get(0, 112, 0), 9 << 4);
    assert.equal(dry.get(0, 112, 0), 1 << 4);
    assert.ok(wet.spawn().y >= 113);
    assert.equal(collides(wet, wet.spawn()), false);
    assert.throws(() => worldSettings({ worldType: 'custom', relief: 81 }), /Invalid custom terrain/);
  });

  test('signed 64-bit and text seeds are stable, and blank seeds resolve to a reproducible value', () => {
    assert.equal(resolveSeed(' +0007 '), '7');
    assert.equal(resolveSeed('-9223372036854775808'), '-9223372036854775808');
    assert.equal(resolveSeed('  forest 🌲  '), '  forest 🌲  ');
    assert.deepEqual(seedWords('7'), [7, 0]);
    assert.deepEqual(seedWords('4294967303'), [7, 1]);
    assert.deepEqual(seedWords('-1'), [0xffffffff, 0xffffffff]);
    const random = resolveSeed('');
    assert.equal(resolveSeed(random), random);
    assert.match(random, /^-?\d+$/);
    assert.equal(BigInt.asIntN(64, BigInt(random)), BigInt(random));
    assert.deepEqual(seedWords('  forest 🌲  '), seedWords('  forest 🌲  '));
    assert.notDeepEqual(seedWords('forest'), seedWords('Forest'));
  });

  test('natural terrain has coherent, seed-specific features and deterministic cross-chunk generation', () => {
    const state = { version: 2, seed: '7', settings: worldSettings(), edits: [] };
    const terrain = createTerrain(state);
    const reversed = createTerrain(state);
    const coordinates = [[-4, 3], [-1, 0], [0, 0], [1, 0], [4, -4], [4000, -4000]];
    const expected = coordinates.map(([x, z]) => chunkPacket(terrain, x, z));
    for (let i = coordinates.length - 1; i >= 0; i--) {
      const [x, z] = coordinates[i];
      assert.deepEqual(chunkPacket(reversed, x, z), expected[i]);
    }
    const other = createTerrain({ ...state, seed: '4294967303' });
    assert.notDeepEqual(chunkPacket(other, 0, 0), expected[2]);
    const flat = createTerrain({ ...state, settings: worldSettings({ worldType: 'flat' }) });
    const mountains = createTerrain({ ...state, settings: worldSettings({ worldType: 'highlands' }) });
    const broad = createTerrain({ ...state, settings: worldSettings({ worldType: 'wide' }) });
    const heights = t => Array.from({ length: 141 }, (_, i) => t.surface(i - 70, 3));
    const range = h => Math.max(...h) - Math.min(...h);
    assert.equal(range(heights(flat)), 0);
    assert.ok(range(heights(terrain)) > 8);
    assert.ok(range(heights(mountains)) > range(heights(terrain)));
    assert.notDeepEqual(heights(broad), heights(terrain));
    for (let x = -65; x <= 63; x++) assert.ok(Math.abs(terrain.surface(x, 2) - terrain.surface(x + 1, 2)) <= 2);

    const counts = new Map();
    let cavernFound = false;
    const plain = createTerrain({ ...state, settings: worldSettings({ trees: false, lakes: false, caverns: false, landmarks: false }) });
    for (let cz = -4; cz <= 4; cz++) {
      for (let cx = -4; cx <= 4; cx++) {
        const states = terrain.column(cx, cz).states;
        const without = plain.column(cx, cz).states;
        for (let i = 0; i < states.length; i++) {
          counts.set(states[i] >> 4, (counts.get(states[i] >> 4) ?? 0) + 1);
          if (states[i] === 0 && without[i] === 16) cavernFound = true;
        }
        assert.ok(!without.some(state => [9, 15, 16, 17, 18, 98].includes(state >> 4)));
      }
    }
    for (const id of [9, 15, 16, 17, 18, 98]) assert.ok(counts.get(id) > 0, 'Missing generated block type ' + id);
    assert.ok(cavernFound);
    assert.equal(terrain.minY, 0);
    assert.equal(terrain.maxY, 255);
    assert.equal(collides(terrain, terrain.spawn()), false);
    assert.ok(terrain.cache.size <= 96);
  });

  test('distant and upper-section edits survive world regeneration and packet encoding', () => {
    const state = { version: 2, seed: 'building', settings: worldSettings(), edits: [] };
    const terrain = createTerrain(state);
    const x = -64001, y = 255, z = 127999;
    const base = terrain.get(x, y, z);
    terrain.set(x, y, z, 45 << 4);
    assert.equal(terrain.editCount, 1);
    assert.equal(terrain.get(x, y, z), 45 << 4);
    const reopened = createTerrain({ ...state, edits: terrain.snapshot() });
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    const packet = decodePacket(chunkPacket(reopened, cx, cz));
    const chunk = new Chunk(cx, cz, true);
    assert.equal(chunk.load(packet.chunkData, 0, packet.bitMap, true, true), packet.chunkData.length);
    assert.equal(chunk.getState(x & 15, y, z & 15), 45 << 4);
    assert.equal(chunk.getSkyLight(x & 15, y, z & 15), 0);
    reopened.set(x, y, z, base);
    assert.equal(reopened.editCount, 0);
    assert.deepEqual(reopened.snapshot(), []);
  });

  test('new workers persist random seeds and stream beyond the former world boundary', { timeout: 8000 }, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'local-landscape-test-'));
    const file = join(directory, 'world.json');
    t.after(() => rm(directory, { recursive: true, force: true }));
    const platform = { createWorker: () => nodeWorker(file) };
    const live = await connect(t, platform, { name: 'Flat', seed: '', settings: { worldType: 'flat', starterMaterials: false }, create: true });
    const state = JSON.parse(await readFile(file, 'utf8')).state;
    assert.equal(state.version, 3);
    assert.equal(state.settings.worldType, 'flat');
    assert.equal(state.settings.starterMaterials, false);
    assert.equal(describeWorld(state).seed, state.seed);
    assert.equal(resolveSeed(state.seed), state.seed);
    const position = live.packets.find(p => p.name === 'position');
    assert.deepEqual([position.x, position.y, position.z], [0.5, 33, 0.5]);
    assert.equal(live.packets.filter(p => p.name === 'set_slot' && p.item).length, 0);
    live.conn.send(C.creativeSlot(36, { id: 2, count: 3, damage: 0 }));
    live.conn.send(C.blockPlace(2, 32, 0, 1, { id: 2, count: 1, damage: 0 }, 8, 8, 8));
    await until(() => live.packets.some(p => p.name === 'block_change' && p.state === 2 << 4));
    live.conn.send(C.position(0.5, 35, 0.5, true));
    for (let x = 8.5; x <= 160.5; x += 8) live.conn.send(C.position(x, 35, 0.5, true));
    await until(() => live.packets.some(p => p.name === 'map_chunk' && p.x >= 10 && p.bitMap));
    await live.conn.close();
    const saved = JSON.parse(await readFile(file, 'utf8')).state;
    assert.deepEqual(saved.settings, state.settings);
    assert.equal(saved.seed, state.seed);
    assert.equal(saved.position.x, 160.5);
    assert.equal(createTerrain(saved).get(2, 33, 0), 2 << 4);
    const reopened = await connect(t, platform, { id: saved.id });
    assert.equal(reopened.packets.find(p => p.name === 'position').x, saved.position.x);
    await reopened.conn.close();
  });

  test('the default world worker sends the seeded natural spawn and terrain, and reloads them', { timeout: 8000 }, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'natural-landscape-test-'));
    const file = join(directory, 'world.json');
    t.after(() => rm(directory, { recursive: true, force: true }));
    const platform = { createWorker: () => nodeWorker(file) };
    const seed = '7';
    const live = await connect(t, platform, { name: 'Natural', seed, create: true });
    const record = JSON.parse(await readFile(file, 'utf8'));
    const terrain = createTerrain(record.state);
    assert.equal(record.state.seed, seed);
    assert.equal(record.state.settings.worldType, 'natural');
    const spawn = terrain.spawn();
    const position = live.packets.find(p => p.name === 'position');
    assert.deepEqual([position.x, position.y, position.z], [spawn.x, spawn.y, spawn.z]);
    assert.equal(collides(terrain, spawn), false);
    const column = live.packets.find(p => p.name === 'map_chunk');
    const expected = decodePacket(chunkPacket(terrain, Math.floor(spawn.x / 16), Math.floor(spawn.z / 16)));
    assert.deepEqual(column.chunkData, expected.chunkData);
    assert.equal(live.decodeErrors.length, 0);
    await live.conn.close();
    const reopened = await connect(t, platform, { id: record.id });
    assert.deepEqual(reopened.packets.find(p => p.name === 'map_chunk').chunkData, expected.chunkData);
    await reopened.conn.close();
  });

  test('version-one saves retain their original terrain, seed hash and existing edits', { timeout: 8000 }, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'legacy-terrace-test-'));
    const file = join(directory, 'world.json');
    t.after(() => rm(directory, { recursive: true, force: true }));
    const seed = seedNumber('old seed text');
    const terrain = new TerraceTerrain(seed);
    terrain.set(2, 56, 0, 45 << 4);
    const state = { version: 1, seed, edits: terrain.snapshot(), position: terrain.spawn() };
    await fileStore(file).create('Old Terrace', state);
    assert.deepEqual(describeWorld(state), { worldType: 'terraces', seed: String(seed), legacySeed: true });
    const live = await connect(t, { createWorker: () => nodeWorker(file) }, { name: 'Old Terrace' });
    const packet = live.packets.find(p => p.name === 'map_chunk');
    const chunk = new Chunk(0, 0, true);
    chunk.load(packet.chunkData, 0, packet.bitMap, true, true);
    assert.equal(chunk.getState(2, 56, 0), 45 << 4);
    assert.equal(chunk.getState(0, 55, 0), 98 << 4);
    await live.conn.close();
  });
}

function nodeWorker(file) {
  const worker = new Worker(new URL(import.meta.url), { workerData: { file } });
  const proxy = new EventTarget();
  worker.on('error', error => {
    const event = new Event('error');
    event.error = error;
    proxy.dispatchEvent(event);
  });
  proxy.postMessage = (message, transfer) => worker.postMessage(message, transfer);
  proxy.terminate = () => worker.terminate();
  return proxy;
}

async function connect(t, platform, options) {
  const conn = new Connection();
  const control = [], packets = [], decodeErrors = [];
  conn.on('control', msg => control.push(msg));
  conn.on('packet', packet => packets.push(packet));
  conn.on('decode_error', error => decodeErrors.push(error));
  t.after(() => conn.close());
  await conn.connectLocal(new LocalWorldSocket(platform, options));
  return { conn, control, packets, decodeErrors };
}

async function until(find) {
  for (let i = 0; i < 160; i++) {
    const value = find();
    if (value) return value;
    await delay(10);
  }
  assert.fail('Expected worker message did not arrive');
}
