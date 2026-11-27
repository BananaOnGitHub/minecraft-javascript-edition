import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { openCheckpointStore, WORLD_DATABASE } from '../client/js/local-world/checkpoints.js';
import { newWorldState, selectGameMode, newCreationOptions, creationOptions } from '../client/js/local-world/world-metadata.js';
import { loadLocalWorld } from '../client/js/local-world/server.js';
import { createTerrain } from '../client/js/local-world/terrain.js';
import { PersistedTerrain } from '../client/js/local-world/persisted-terrain.js';
import { LayeredFlatTerrain, flatSettings } from '../client/js/local-world/flat-world.js';
import { C, decodePacket } from '../client/js/net/packets.js';

test('flat layers encode exact heights, block metadata, negative coordinates and edited upper sections', () => {
  const config = flatSettings({ biome: 2, layers: [{ id: 7, count: 1 }, { id: 35, metadata: 11, count: 2 }, { id: 24, metadata: 2, count: 3 }] });
  const terrain = new LayeredFlatTerrain('7', config);
  assert.equal(terrain.spawn().y, 6);
  for (const [x, z] of [[0, 0], [-1, -17], [32, -16], [-16000, 31999]]) {
    assert.equal(terrain.get(x, 0, z), 7 << 4);
    assert.equal(terrain.get(x, 1, z), (35 << 4) | 11);
    assert.equal(terrain.get(x, 5, z), (24 << 4) | 2);
    assert.equal(terrain.get(x, 6, z), 0);
    assert.equal(terrain.column(Math.floor(x / 16), Math.floor(z / 16)).biomes[0], 2);
  }
  assert.throws(() => flatSettings({ layers: [{ id: 1, count: 257 }] }), /thickness/);
  assert.throws(() => flatSettings({ layers: [{ id: 1, count: 255 }, { id: 2, count: 2 }] }), /256/);
  assert.throws(() => flatSettings({ layers: [{ id: 1, metadata: 16, count: 1 }] }), /metadata/);
});

test('mode changes respect explicit commands overrides and hardcore restrictions', () => {
  const draft = newCreationOptions();
  selectGameMode(draft, 'creative');
  assert.equal(draft.cheats, true);
  draft.cheats = false;
  draft.cheatsTouched = true;
  selectGameMode(draft, 'survival');
  selectGameMode(draft, 'creative');
  assert.equal(draft.cheats, false);
  draft.cheats = true;
  draft.bonusChest = true;
  selectGameMode(draft, 'hardcore');
  assert.deepEqual(creationOptions(draft), { gameMode: 'hardcore', hardcore: true, cheats: false, bonusChest: false, structures: true });
  selectGameMode(draft, 'creative');
  assert.equal(creationOptions(draft).cheats, true);
});

test('database upgrade retains version-one and version-two checkpoints', async () => {
  const idb = new IDBFactory();
  await new Promise((resolve, reject) => {
    const r = idb.open(WORLD_DATABASE, 1);
    r.onupgradeneeded = () => {
      const store = r.result.createObjectStore('checkpoints', { keyPath: 'id' });
      for (const version of [1, 2]) store.add({ id: 'legacy-' + version, state: { version, seed: version === 1 ? 1234 : ' old text ' }, revision: 1 });
    };
    r.onerror = () => reject(r.error);
    r.onsuccess = () => { r.result.close(); resolve(); };
  });
  const store = await openCheckpointStore(WORLD_DATABASE, idb);
  assert.equal((await store.load('legacy-1')).state.seed, 1234);
  assert.equal((await store.load('legacy-2')).state.seed, ' old text ');
  assert.equal(await store.loadChunk('legacy-1', 0, 0), undefined);
  store.close();
});

test('concurrent creation allocates distinct IDs and portable unique directory names', async () => {
  const idb = new IDBFactory();
  const store1 = await openCheckpointStore(WORLD_DATABASE, idb);
  const store2 = await openCheckpointStore(WORLD_DATABASE, idb);
  const a = newWorldState({ name: 'Workshop', seed: '7' });
  const b = newWorldState({ name: 'Workshop', seed: '7' });
  assert.notEqual(a.id, b.id);
  const [left, right] = await Promise.all([store1.createWorld(a), store2.createWorld(b)]);
  assert.deepEqual([left.state.directory, right.state.directory].sort(), ['Workshop', 'Workshop (2)']);
  assert.deepEqual((await store1.summaries()).map(row => row.displayName), ['Workshop', 'Workshop']);
  await assert.rejects(loadLocalWorld({ name: 'Workshop' }, () => {}, name => openCheckpointStore(name, idb)), /Several worlds/);
  const first = await store1.load(left.id);
  await store1.save(left.id, first.revision, { ...first.state, seed: '8' });
  await assert.rejects(store2.save(left.id, first.revision, first.state), /revision conflict/);
  store1.close();
  store2.close();
});

test('committed base columns survive regeneration, and player changes remain separate', async () => {
  const idb = new IDBFactory();
  const store = await openCheckpointStore(WORLD_DATABASE, idb);
  const state = newWorldState({ name: 'Durable', seed: '7', settings: { worldType: 'flat' } });
  const record = await store.createWorld(state);
  const terrain = new PersistedTerrain(createTerrain({ ...state, edits: [] }), state, store);
  await Promise.all([terrain.prepare(-1, 0), terrain.prepare(-1, 0)]);
  const old = terrain.get(-1, 32, 0);
  terrain.set(-1, 33, 0, 45 << 4);
  const edited = { ...state, edits: terrain.snapshot() };
  await store.save(record.id, record.revision, edited);
  const generator = createTerrain({ ...state, edits: [] });
  generator.column = () => { throw new Error('A stored column was regenerated'); };
  const reopened = new PersistedTerrain(generator, edited, store);
  await reopened.prepare(-1, 0);
  assert.equal(reopened.get(-1, 32, 0), old);
  assert.equal(reopened.get(-1, 33, 0), 45 << 4);
  reopened.set(-1, 33, 0, 0);
  assert.equal(reopened.editCount, 0);
  assert.equal((await store.loadChunk(state.id, -1, 0)).states[33 * 256 + 15], 0);
  const incompatible = { ...state, generator: { ...state.generator, version: 2 } };
  assert.throws(() => createTerrain(incompatible), /unavailable generator/);
  assert.equal((await store.load(state.id)).state.generator.version, 1);
  store.close();
});

test('server applies player capabilities and enforces command permission for each mode', { timeout: 10000 }, async () => {
  const idb = new IDBFactory();
  const open = name => openCheckpointStore(name, idb);
  for (const mode of ['survival', 'hardcore', 'creative']) {
    const packets = [];
    const session = await loadLocalWorld({
      name: mode, seed: '7', settings: { worldType: 'flat' },
      creation: { gameMode: mode, cheats: true, bonusChest: true }, create: true,
    }, message => { if (message.bytes) packets.push(decodePacket(message.bytes)); }, open);
    await session.handle({ type: 'start' });
    const login = packets.find(p => p.name === 'login');
    assert.equal(login.gameMode, mode === 'creative' ? 1 : mode === 'hardcore' ? 8 : 0);
    assert.equal(login.difficulty, mode === 'hardcore' ? 3 : 2);
    assert.equal(packets.find(p => p.name === 'abilities').flags, mode === 'creative' ? 13 : 0);
    await session.handle({ type: 'packet', bytes: C.chat('/seed') });
    const message = JSON.parse(packets.filter(p => p.name === 'chat').at(-1).message).text;
    assert.equal(message, mode === 'hardcore' ? 'Commands are disabled for this world.' : 'Seed 7');
    if (mode === 'creative') {
      await session.handle({ type: 'packet', bytes: C.chat('/gamemode survival') });
      assert.equal(session.gameMode, 0);
    }
    await session.close();
  }
  const store = await open(WORLD_DATABASE);
  const records = await store.summaries();
  assert.equal(records.length, 3);
  const creative = await store.load(records.find(r => r.displayName === 'creative').id);
  assert.equal(creative.state.creation.gameMode, 'survival');
  store.close();
  const named = await loadLocalWorld({ name: 'creative' }, () => {}, open);
  assert.equal(named.gameMode, 0);
  await named.close();
});
