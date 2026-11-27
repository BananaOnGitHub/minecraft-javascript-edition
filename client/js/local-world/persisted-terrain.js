import { PopulationPlanner } from './population.js';

const CACHE_LIMIT = 384;
const RAW_CACHE_LIMIT = 64;
const keyOf = (x, z) => x + ',' + z;
const blockIndex = (x, y, z) => y * 256 + (z & 15) * 16 + (x & 15);

// The generator supplies a column only when this world has never stored it.
// Stored base columns and sparse player edits have separate persistence paths.
export class PersistedTerrain {
  constructor(generator, state, store) {
    this.generator = generator;
    this.store = store;
    this.worldId = state.id;
    this.generatorId = state.generator.id + ':' + state.generator.version;
    this.cache = new Map();
    this.pending = new Map();
    this.edits = new Map(state.edits.map(([key, changes]) => [key, new Map(changes)]));
    this.editCount = [...this.edits.values()].reduce((sum, changes) => sum + changes.size, 0);
    this.minY = generator.minY;
    this.maxY = generator.maxY;
    this.chunkLimit = generator.chunkLimit;
    this.viewDistanceLimit = generator.viewDistanceLimit;
    if (generator.population) {
      this.rawCache = new Map();
      this.rawPending = new Map();
      this.population = new PopulationPlanner({ generator, worldId: this.worldId,
        generatorId: this.generatorId, store, loadBase: (x, z) => this.readRawColumn(x, z) });
    }
  }

  contains(x, z) { return this.generator.contains(x, z); }

  async prepare(x, z) {
    const key = keyOf(x, z);
    if (this.cache.has(key)) return;
    let pending = this.pending.get(key);
    if (!pending) {
      pending = this.loadColumn(x, z).finally(() => this.pending.delete(key));
      this.pending.set(key, pending);
    }
    await pending;
  }

  async readStoredColumn(x, z) {
    let record = await this.store.loadChunk(this.worldId, x, z);
    if (!record) {
      const column = this.generator.column(x, z);
      record = await this.store.saveChunk({
        worldId: this.worldId, generatorId: this.generatorId, x, z,
        states: column.states, biomes: column.biomes,
        lastSection: column.lastSection,
      });
    }
    if (record.generatorId !== this.generatorId ||
        !(record.states instanceof Uint16Array) || record.states.length !== 65536 ||
        !(record.biomes instanceof Uint8Array) || record.biomes.length !== 256) {
      throw new Error('Stored chunk data does not match this world generator.');
    }
    return record;
  }

  async readRawColumn(x, z) {
    const key = keyOf(x, z);
    const cached = this.rawCache.get(key);
    if (cached) {
      this.rawCache.delete(key);
      this.rawCache.set(key, cached);
      return cached;
    }
    let pending = this.rawPending.get(key);
    if (!pending) {
      pending = this.readStoredColumn(x, z).then(record => {
        this.rawCache.set(key, record);
        if (this.rawCache.size > RAW_CACHE_LIMIT) this.rawCache.delete(this.rawCache.keys().next().value);
        return record;
      }).finally(() => this.rawPending.delete(key));
      this.rawPending.set(key, pending);
    }
    return pending;
  }

  async loadColumn(x, z) {
    const base = this.population ? await this.readRawColumn(x, z) : await this.readStoredColumn(x, z);
    const record = this.population ? await this.population.completeColumn(x, z, base) : base;
    this.cache.set(keyOf(x, z), record);
    if (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value);
  }

  baseColumn(x, z) {
    const key = keyOf(x, z);
    const record = this.cache.get(key);
    if (!record) throw new Error('Chunk must be prepared before reading.');
    this.cache.delete(key);
    this.cache.set(key, record);
    return record;
  }

  column(x, z) {
    const base = this.baseColumn(x, z);
    const changes = this.edits.get(keyOf(x, z));
    if (!changes) return base;
    const states = base.states.slice();
    for (const [index, state] of changes) states[index] = state;
    // An edit may add a block above a stored lastSection.
    return { states, biomes: base.biomes };
  }

  get(x, y, z) {
    if (!this.contains(x, z) || y < this.minY || y > this.maxY) return 0;
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    const index = blockIndex(x, y, z);
    return this.edits.get(keyOf(cx, cz))?.get(index) ?? this.baseColumn(cx, cz).states[index];
  }

  set(x, y, z, state) {
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    const key = keyOf(cx, cz);
    const index = blockIndex(x, y, z);
    let changes = this.edits.get(key);
    if (state === this.baseColumn(cx, cz).states[index]) {
      if (changes?.delete(index)) this.editCount--;
      if (changes?.size === 0) this.edits.delete(key);
      return;
    }
    if (!changes) {
      changes = new Map();
      this.edits.set(key, changes);
    }
    if (!changes.has(index)) this.editCount++;
    changes.set(index, state);
  }

  snapshot() {
    return [...this.edits].map(([key, changes]) => [key, [...changes]]);
  }

  get cachedBytes() {
    const arrays = new Set();
    for (const chunk of [...this.cache.values(), ...(this.rawCache?.values() ?? [])]) {
      arrays.add(chunk.states);
      arrays.add(chunk.biomes);
    }
    return [...arrays].reduce((sum, array) => sum + array.byteLength, 0);
  }
}
