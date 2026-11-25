import { Writer } from '../net/buffer.js';
import { WORLD_DATABASE, openCheckpointStore } from './checkpoints.js';
import { blockPacket, chunkPacket, positionPacket, readAction, slotPacket, unloadPacket } from './protocol.js';
import { BUILD_CEILING, CHUNK_LIMIT, FOUNDATION_Y, MATERIALS, TerraceTerrain, collides, inside, playerBox, seedNumber } from './terrain.js';

const SAVE_VERSION = 1;
const FACE_OFFSETS = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];

export async function loadLocalWorld(options, emit, openStore = openCheckpointStore) {
  const store = await openStore(WORLD_DATABASE);
  const { name, seed } = options;
  try {
    if (typeof name !== 'string' || !name.trim() || name.length > 32) {
      throw new Error('Enter a world name of up to 32 characters.');
    }

    let record;
    if (options.create) {
      const state = {
        version: SAVE_VERSION,
        seed: seedNumber(seed || name),
        edits: [],
        position: { x: 0.5, y: 56, z: 0.5, yaw: 0, pitch: 0 },
      };
      const meta = await store.create(name, state);
      record = { ...meta, state };
    } else {
      record = await store.load(name);
      if (!record) throw new Error('This local world could not be found.');
      if (record.state.version !== SAVE_VERSION) throw new Error('This world uses a different save format.');
    }

    return new TerraceSession(store, record, emit);
  } catch (error) {
    store.close();
    if (error.name === 'ConstraintError') throw new Error('A world with this name already exists.');
    throw error;
  }
}

class TerraceSession {
  constructor(store, record, emit) {
    this.store = store;
    this.record = record;
    this.emit = emit;
    this.terrain = new TerraceTerrain(record.state.seed, record.state.edits);
    this.position = record.state.position;
    this.savedPosition = this.position;
    this.hotbar = Array.from({ length: 9 }, (_, i) => MATERIALS[i] ? { id: MATERIALS[i], count: 64, damage: 0 } : null);
    this.selectedSlot = 0;
    this.loaded = new Map();
    this.distance = 2;
    this.chunks = [];
    this.metrics = { ticks: 0, chunkCount: 0, chunkMs: 0, peakChunkMs: 0, peakTickMs: 0, saves: 0 };
  }

  control(type, fields) {
    this.emit({ type: 'control', message: { type, ...fields } });
  }

  send(bytes) {
    this.emit({ type: 'packet', bytes }, [bytes.buffer]);
  }

  start() {
    if (this.timer) return;
    this.control('login_success', { username: 'Builder', uuid: '70795e02-56e1-4881-a673-6c0b027f3c3e' });
    this.send(new Writer().varint(0x01).i32(1).u8(1).i8(0).u8(0).u8(1).string('flat').bool(false).build());
    this.send(new Writer().varint(0x03).i64(0).i64(-6000).build());
    this.send(new Writer().varint(0x05).position(0, 56, 0).build());
    this.send(new Writer().varint(0x06).f32(20).varint(20).f32(5).build());
    this.send(new Writer().varint(0x39).i8(0x0d).f32(0.05).f32(0.1).build());
    this.hotbar.forEach((item, i) => this.send(slotPacket(36 + i, item)));
    this.scheduleChunks();
    this.streamChunks(1);
    this.send(positionPacket(this.position));
    this.timer = setInterval(() => this.tick(), 50);
  }

  tick() {
    const start = performance.now();
    this.streamChunks(3);
    this.metrics.peakTickMs = Math.max(this.metrics.peakTickMs, performance.now() - start);
    if (++this.metrics.ticks % 20 === 0) {
      this.emit({ type: 'metrics', metrics: {
        ...this.metrics,
        queuedChunks: this.chunks.length,
        loadedChunks: this.loaded.size,
        blockEdits: this.terrain.edits.size,
      } });
    }
  }

  scheduleChunks() {
    const cx = Math.floor(this.position.x / 16), cz = Math.floor(this.position.z / 16);
    const needed = new Map();
    for (let z = Math.max(-CHUNK_LIMIT, cz - this.distance); z <= Math.min(CHUNK_LIMIT - 1, cz + this.distance); z++) {
      for (let x = Math.max(-CHUNK_LIMIT, cx - this.distance); x <= Math.min(CHUNK_LIMIT - 1, cx + this.distance); x++) {
        needed.set(x + ',' + z, { x, z, distance: (x - cx) ** 2 + (z - cz) ** 2 });
      }
    }
    this.center = [cx, cz];
    for (const [key, { x, z }] of this.loaded) {
      if (needed.has(key)) continue;
      this.send(unloadPacket(x, z));
      this.loaded.delete(key);
    }
    this.chunks = [...needed].filter(([key]) => !this.loaded.has(key))
      .sort((a, b) => a[1].distance - b[1].distance);
  }

  streamChunks(limit) {
    for (const [key, { x, z }] of this.chunks.splice(0, limit)) {
      const start = performance.now();
      const packet = chunkPacket(this.terrain, x, z);
      const elapsed = performance.now() - start;
      this.metrics.chunkCount++;
      this.metrics.chunkMs += elapsed;
      this.metrics.peakChunkMs = Math.max(this.metrics.peakChunkMs, elapsed);
      this.send(packet);
      this.loaded.set(key, { x, z });
    }
  }

  move({ type, ...next }) {
    const position = { ...this.position, ...next };
    const delta = Math.hypot(position.x - this.position.x, position.y - this.position.y, position.z - this.position.z);
    if (!Object.values(position).every(Number.isFinite) || delta > 8 || collides(this.terrain, position)) {
      this.send(positionPacket(this.position));
      return;
    }
    if (Object.keys(next).every(key => this.position[key] === position[key])) return;
    this.position = position;
    const [cx, cz] = this.center;
    if (Math.floor(position.x / 16) !== cx || Math.floor(position.z / 16) !== cz) this.scheduleChunks();
  }

  editable({ x, y, z }) {
    return inside(x, z) && y > FOUNDATION_Y && y <= BUILD_CEILING;
  }

  withinReach({ x, y, z }) {
    const p = this.position;
    return Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y - 1.62, z + 0.5 - p.z) <= 6;
  }

  async edit(target, state, allowed) {
    const { x, y, z } = target;
    if (!inside(x, z) || y < FOUNDATION_Y || y > BUILD_CEILING) return;
    const oldState = this.terrain.get(x, y, z);
    if (allowed && state !== oldState) {
      this.terrain.set(x, y, z, state);
      try {
        await this.save();
      } catch (error) {
        this.terrain.set(x, y, z, oldState);
        this.send(blockPacket(target, oldState));
        throw error;
      }
    }
    this.send(blockPacket(target, this.terrain.get(x, y, z)));
  }

  place({ target, face }) {
    const offset = FACE_OFFSETS[face];
    if (!offset) return;
    const { x, y, z } = target;
    const next = { x: x + offset[0], y: y + offset[1], z: z + offset[2] };
    const item = this.hotbar[this.selectedSlot];
    const [x0, y0, z0, x1, y1, z1] = playerBox(this.position);
    const occupied = next.x < x1 && next.x + 1 > x0 && next.y < y1 &&
      next.y + 1 > y0 && next.z < z1 && next.z + 1 > z0;
    const allowed = !!item && this.editable(next) && this.withinReach(target) && !occupied &&
      this.terrain.get(x, y, z) !== 0 && this.terrain.get(next.x, next.y, next.z) === 0;
    return this.edit(next, item ? (item.id << 4) | item.damage : 0, allowed);
  }

  setSlot({ slot, item }) {
    if (slot < 36 || slot > 44) {
      if (slot >= 0 && slot < 36) this.send(slotPacket(slot, null));
      return;
    }
    if (!item || MATERIALS.includes(item.id)) {
      this.hotbar[slot - 36] = item && {
        id: item.id, count: 64, damage: item.id === 35 ? item.damage & 15 : 0,
      };
    }
    this.send(slotPacket(slot, this.hotbar[slot - 36]));
  }

  async handle({ type, bytes }) {
    if (type === 'start') return this.start();
    if (type !== 'packet' || !this.timer) throw new Error('Local world session is inactive.');
    const action = readAction(bytes);
    switch (action?.type) {
      case 'move': return this.move(action);
      case 'dig':
        if (action.status === 0) return this.edit(action.target, 0, this.editable(action.target) && this.withinReach(action.target));
        break;
      case 'place': return this.place(action);
      case 'select':
        if (action.slot >= 0 && action.slot < 9) this.selectedSlot = action.slot;
        break;
      case 'slot': return this.setSlot(action);
      case 'distance': {
        const distance = Math.max(2, Math.min(4, action.distance));
        if (distance !== this.distance) {
          this.distance = distance;
          this.scheduleChunks();
        }
        break;
      }
    }
  }

  async save() {
    const state = { ...this.record.state, edits: this.terrain.snapshot(), position: this.position };
    const next = await this.store.save(this.record.id, this.record.revision, state);
    this.record = { ...next, state };
    this.savedPosition = this.position;
    this.metrics.saves++;
  }

  async close() {
    clearInterval(this.timer);
    try {
      if (this.position !== this.savedPosition) await this.save();
    } finally {
      this.store.close();
    }
  }
}
