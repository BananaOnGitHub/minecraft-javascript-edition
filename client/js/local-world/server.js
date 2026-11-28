import { Writer } from '../net/buffer.js';
import { WORLD_DATABASE, openCheckpointStore } from './checkpoints.js';
import { blockPacket, chunkPacket, positionPacket, readAction, slotPacket, unloadPacket } from './protocol.js';
import { MATERIALS, PLACEABLE_MATERIALS, createTerrain, collides, isWater, playerBox } from './terrain.js';
import { worldSettings } from './world-settings.js';
import { SAVE_VERSION, creationOptions, newWorldState } from './world-metadata.js';
import { PersistedTerrain } from './persisted-terrain.js';

const FACE_OFFSETS = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];

export async function loadLocalWorld(options, emit, openStore = openCheckpointStore) {
  const store = await openStore(WORLD_DATABASE);
  const { name } = options;
  try {
    if (!options.id && (typeof name !== 'string' || !name.trim() || name.length > 32)) {
      throw new Error('Enter a world name of up to 32 characters.');
    }

    let record;
    if (options.create) {
      const state = newWorldState(options);
      state.spawn = createTerrain(state).spawn();
      state.position = state.spawn;
      record = await store.createWorld(state);
    } else {
      record = await store.load(options.id ?? name);
      if (!record && !options.id) {
        const matches = (await store.summaries()).filter(world => world.displayName === name);
        if (matches.length > 1) throw new Error('Several worlds use this name. Select the world from the list.');
        if (matches.length === 1) record = await store.load(matches[0].id);
      }
      if (!record) throw new Error('This local world could not be found.');
      if (![1, 2, SAVE_VERSION].includes(record.state.version)) throw new Error('This world uses a different save format.');
    }

    return new LocalWorldSession(store, record, emit);
  } catch (error) {
    store.close();
    if (error.name === 'ConstraintError') throw new Error('A world with this name already exists.');
    throw error;
  }
}

class LocalWorldSession {
  constructor(store, record, emit) {
    this.store = store;
    this.record = record;
    this.emit = emit;
    const generator = createTerrain(record.state.version === SAVE_VERSION ? { ...record.state, edits: [] } : record.state);
    this.terrain = record.state.version === SAVE_VERSION ? new PersistedTerrain(generator, record.state, store) : generator;
    this.settings = record.state.version === 1 ? worldSettings({ worldType: 'terraces' }) : worldSettings(record.state.settings);
    this.spawn = record.state.spawn ?? generator.spawn();
    this.creation = creationOptions(record.state.creation);
    this.gameMode = this.creation.gameMode === 'creative' ? 1 : 0;
    this.position = record.state.position;
    this.savedPosition = this.position;
    this.hotbar = record.state.hotbar ?? Array.from({ length: 9 }, (_, i) => this.gameMode === 1 && this.settings.starterMaterials && MATERIALS[i] ? { id: MATERIALS[i], count: 64, damage: 0 } : null);
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

  sendAbilities() {
    this.send(new Writer().varint(0x39).i8(this.gameMode === 1 ? 0x0d : 0).f32(0.05).f32(0.1).build());
  }

  say(text) {
    this.send(new Writer().varint(0x02).string(JSON.stringify({ text })).i8(0).build());
  }

  async chat(text) {
    if (!text.startsWith('/')) { this.say('<Builder> ' + text); return; }
    if (!this.creation.cheats || this.creation.hardcore) {
      this.say('Commands are disabled for this world.');
      return;
    }
    const [command, value] = text.trim().split(/\s+/);
    if (command === '/seed') { this.say('Seed ' + this.record.state.seed); return; }
    if (command === '/gamemode' && ['0', '1', 'survival', 'creative'].includes(value)) {
      this.gameMode = ['1', 'creative'].includes(value) ? 1 : 0;
      await this.save();
      this.send(new Writer().varint(0x2b).u8(3).f32(this.gameMode).build());
      this.sendAbilities();
      this.say('Game mode changed.');
      return;
    }
    this.say('Implemented commands: /seed, /gamemode survival, /gamemode creative.');
  }

  async start() {
    if (this.timer) return;
    this.control('login_success', { username: 'Builder', uuid: '70795e02-56e1-4881-a673-6c0b027f3c3e' });
    const levelType = ['terraces', 'flat'].includes(this.settings.worldType) ? 'flat' : 'default';
    this.send(new Writer().varint(0x01).i32(1).u8(this.gameMode | (this.creation.hardcore ? 8 : 0)).i8(0).u8(this.creation.hardcore ? 3 : 2).u8(1).string(levelType).bool(false).build());
    this.send(new Writer().varint(0x03).i64(0).i64(-6000).build());
    this.send(new Writer().varint(0x05).position(Math.floor(this.spawn.x), this.spawn.y, Math.floor(this.spawn.z)).build());
    this.send(new Writer().varint(0x06).f32(20).varint(20).f32(5).build());
    this.sendAbilities();
    this.hotbar.forEach((item, i) => this.send(slotPacket(36 + i, item)));
    this.scheduleChunks();
    await this.streamChunks(1);
    this.send(positionPacket(this.position));
    this.timer = setInterval(() => this.tick(), 50);
  }

  async tick() {
    if (this.streaming || this.stopping) return;
    const start = performance.now();
    const streaming = this.streamChunks(3);
    this.streaming = streaming;
    try {
      await streaming;
      this.flushGenerationUpdates();
    } catch (error) {
      clearInterval(this.timer);
      this.control('error', { message: error.message });
      this.send(new Writer().varint(0x40).string(JSON.stringify({ text: error.message })).build());
    } finally {
      this.streaming = null;
    }
    this.metrics.peakTickMs = Math.max(this.metrics.peakTickMs, performance.now() - start);
    if (++this.metrics.ticks % 20 === 0) {
      this.emit({ type: 'metrics', metrics: {
        ...this.metrics,
        queuedChunks: this.chunks.length,
        loadedChunks: this.loaded.size,
        blockEdits: this.terrain.editCount,
        cachedBaseBytes: this.terrain.cachedBytes ?? 0,
      } });
    }
  }

  scheduleChunks() {
    const cx = Math.floor(this.position.x / 16), cz = Math.floor(this.position.z / 16);
    const needed = new Map();
    const limit = this.terrain.chunkLimit;
    for (let z = Math.max(-limit, cz - this.distance); z <= Math.min(limit - 1, cz + this.distance); z++) {
      for (let x = Math.max(-limit, cx - this.distance); x <= Math.min(limit - 1, cx + this.distance); x++) {
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

  flushGenerationUpdates(exclude) {
    for (const changed of this.terrain.takeChangedColumns?.() ?? []) {
      const key = changed.x + ',' + changed.z;
      if (this.loaded.has(key) && key !== exclude) this.send(chunkPacket(this.terrain, changed.x, changed.z));
    }
  }

  async streamChunks(limit) {
    for (const [key, { x, z }] of this.chunks.splice(0, limit)) {
      const start = performance.now();
      await this.terrain.prepare?.(x, z);
      if (this.stopping) return;
      this.flushGenerationUpdates(key);
      if (Math.abs(x - this.center[0]) > this.distance || Math.abs(z - this.center[1]) > this.distance) continue;
      const packet = chunkPacket(this.terrain, x, z);
      const elapsed = performance.now() - start;
      this.metrics.chunkCount++;
      this.metrics.chunkMs += elapsed;
      this.metrics.peakChunkMs = Math.max(this.metrics.peakChunkMs, elapsed);
      this.send(packet);
      this.loaded.set(key, { x, z });
    }
  }

  async move({ type, ...next }) {
    const position = { ...this.position, ...next };
    const delta = Math.hypot(position.x - this.position.x, position.y - this.position.y, position.z - this.position.z);
    if (!Object.values(position).every(Number.isFinite) || delta > 8 ||
        !this.terrain.contains(position.x, position.z)) {
      this.send(positionPacket(this.position));
      return;
    }
    for (const [x, z] of [[position.x - 0.31, position.z - 0.31], [position.x + 0.31, position.z - 0.31],
      [position.x - 0.31, position.z + 0.31], [position.x + 0.31, position.z + 0.31]]) {
      if (this.terrain.contains(x, z)) await this.terrain.prepare?.(Math.floor(x / 16), Math.floor(z / 16));
    }
    if (collides(this.terrain, position)) {
      this.send(positionPacket(this.position));
      return;
    }
    if (Object.keys(next).every(key => this.position[key] === position[key])) return;
    this.position = position;
    const [cx, cz] = this.center;
    if (Math.floor(position.x / 16) !== cx || Math.floor(position.z / 16) !== cz) this.scheduleChunks();
  }

  editable({ x, y, z }) {
    return this.terrain.contains(x, z) && y > this.terrain.minY && y <= this.terrain.maxY;
  }

  withinReach({ x, y, z }) {
    const p = this.position;
    return Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y - 1.62, z + 0.5 - p.z) <= 6;
  }

  async edit(target, state, allowed) {
    const { x, y, z } = target;
    if (!this.terrain.contains(x, z) || y < this.terrain.minY || y > this.terrain.maxY) return;
    await this.terrain.prepare?.(Math.floor(x / 16), Math.floor(z / 16));
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

  async place({ target, face }) {
    const offset = FACE_OFFSETS[face];
    if (!offset) return;
    const { x, y, z } = target;
    const next = { x: x + offset[0], y: y + offset[1], z: z + offset[2] };
    if (!this.withinReach(target)) return;
    for (const point of [target, next]) {
      if (this.terrain.contains(point.x, point.z)) await this.terrain.prepare?.(Math.floor(point.x / 16), Math.floor(point.z / 16));
    }
    const item = this.hotbar[this.selectedSlot];
    const [x0, y0, z0, x1, y1, z1] = playerBox(this.position);
    const occupied = next.x < x1 && next.x + 1 > x0 && next.y < y1 &&
      next.y + 1 > y0 && next.z < z1 && next.z + 1 > z0;
    const clicked = this.terrain.get(x, y, z);
    const existing = this.terrain.get(next.x, next.y, next.z);
    const allowed = !!item && this.editable(next) && this.withinReach(target) && !occupied &&
      clicked !== 0 && !isWater(clicked) && (existing === 0 || isWater(existing));
    return this.edit(next, item ? (item.id << 4) | item.damage : 0, allowed);
  }

  setSlot({ slot, item }) {
    if (this.gameMode !== 1) {
      if (slot >= 36 && slot < 45) this.send(slotPacket(slot, this.hotbar[slot - 36]));
      return;
    }
    if (slot < 36 || slot > 44) {
      if (slot >= 0 && slot < 36) this.send(slotPacket(slot, null));
      return;
    }
    if (!item || PLACEABLE_MATERIALS.has(item.id)) {
      this.hotbar[slot - 36] = item && {
        id: item.id, count: 64, damage: item.id === 35 ? item.damage & 15 : [17, 18].includes(item.id) ? item.damage & 3 : 0,
      };
    }
    this.send(slotPacket(slot, this.hotbar[slot - 36]));
  }

  async handle({ type, bytes }) {
    if (type === 'start') return this.start();
    if (type !== 'packet' || !this.timer) throw new Error('Local world session is inactive.');
    const action = readAction(bytes);
    switch (action?.type) {
      case 'chat': return this.chat(action.text);
      case 'move': return this.move(action);
      case 'dig':
        if (!this.withinReach(action.target)) return;
        if (action.status === (this.gameMode === 1 ? 0 : 2)) return this.edit(action.target, 0, this.editable(action.target) && this.withinReach(action.target));
        break;
      case 'place': return this.place(action);
      case 'select':
        if (action.slot >= 0 && action.slot < 9) this.selectedSlot = action.slot;
        break;
      case 'slot': return this.setSlot(action);
      case 'distance': {
        const distance = Math.max(2, Math.min(this.terrain.viewDistanceLimit, action.distance));
        if (distance !== this.distance) {
          this.distance = distance;
          this.scheduleChunks();
        }
        break;
      }
    }
  }

  async save() {
    const state = { ...this.record.state, edits: this.terrain.snapshot(), position: this.position,
      hotbar: this.hotbar, creation: { ...this.creation, gameMode: this.gameMode === 1 ? 'creative' : this.creation.hardcore ? 'hardcore' : 'survival' } };
    const next = await this.store.save(this.record.id, this.record.revision, state);
    this.record = { ...next, state };
    this.savedPosition = this.position;
    this.metrics.saves++;
  }

  async close() {
    this.stopping = true;
    clearInterval(this.timer);
    try {
      await this.streaming;
      await this.save();
    } finally {
      this.store.close();
    }
  }
}
