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
import { TerraceTerrain, seedNumber } from '../client/js/local-world/terrain.js';
import { Connection } from '../client/js/net/connection.js';
import { C } from '../client/js/net/packets.js';
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
      const live = await connect(t, platform, { name: 'Terrace', seed: 'plateaus', create: true });
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

      const reopened = await connect(t, platform, { name: 'Terrace' });
      const position = reopened.packets.find(p => p.name === 'position');
      assert.deepEqual([position.x, position.y, position.z], [18.5, 61, 0.5]);
      const loaded = await until(() => reopened.packets.find(p => p.name === 'map_chunk' && p.x === 0 && p.z === 0));
      chunk.load(loaded.chunkData, 0, loaded.bitMap, true, true);
      assert.equal(chunk.getState(2, 56, 0), 35 << 4);
      assert.equal(chunk.getState(3, 55, 0), 0);
      await reopened.conn.close();

      const duplicate = new Connection();
      t.after(() => duplicate.close());
      await assert.rejects(duplicate.connectLocal(new LocalWorldSocket(platform,
        { name: 'Terrace', seed: 'different', create: true })), /already exists/);
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
