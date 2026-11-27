// Optional feature planning for independently designed voxel generators.
// A source reads immutable base terrain and its own writes, then publishes a
// single durable batch. Resolving batches in coordinate order makes a finished
// destination independent of exploration order and concurrent requests.
const keyOf = (x, z) => `${x},${z}`;
const indexOf = (x, y, z) => y * 256 + (z & 15) * 16 + (x & 15);
const validState = state => Number.isInteger(state) && state >= 0 && state <= 65535;

export class PopulationPlanner {
  constructor({ generator, worldId, generatorId, store, loadBase }) {
    const { id, radius, populate } = generator.population;
    if (typeof id !== 'string' || !id || !Number.isInteger(radius) || radius < 0 || radius > 4 || typeof populate !== 'function') {
      throw new Error('Invalid population stage (versioned ID, radius 0–4, synchronous callback required).');
    }
    this.generator = generator;
    this.stage = { id, radius, populate };
    this.worldId = worldId;
    this.generatorId = generatorId;
    this.store = store;
    this.loadBase = loadBase;
    this.pending = new Map();
  }

  *neighborhood(x, z) {
    const { radius } = this.stage;
    for (let cx = x - radius; cx <= x + radius; cx++) {
      for (let cz = z - radius; cz <= z + radius; cz++) {
        if (this.generator.contains(cx * 16, cz * 16)) yield [cx, cz];
      }
    }
  }

  ensureSource(x, z) {
    const key = keyOf(x, z);
    let current = this.pending.get(key);
    if (!current) {
      current = this.planSource(x, z).finally(() => this.pending.delete(key));
      this.pending.set(key, current);
    }
    return current;
  }

  validate(record, x, z) {
    const allowed = new Set([...this.neighborhood(x, z)].map(([cx, cz]) => keyOf(cx, cz)));
    if (record?.worldId !== this.worldId || record.generatorId !== this.generatorId ||
        record.stageId !== this.stage.id || record.x !== x || record.z !== z || !Array.isArray(record.targets)) {
      throw new Error('Stored population batch does not match its generator.');
    }
    for (const target of record.targets) {
      const key = keyOf(target.x, target.z);
      if (!allowed.delete(key) || !Array.isArray(target.changes)) throw new Error('Invalid population target.');
      let previous = -1;
      for (const change of target.changes) {
        const [index, state] = change;
        if (!Number.isInteger(index) || index <= previous || index < 0 || index >= 65536 ||
            (index >> 8) < this.generator.minY || (index >> 8) > this.generator.maxY || !validState(state)) {
          throw new Error('Invalid population block change.');
        }
        previous = index;
      }
    }
    return record;
  }

  async planSource(x, z) {
    const stored = await this.store.loadPopulation(this.worldId, this.generatorId, this.stage.id, x, z);
    if (stored) return this.validate(stored, x, z);
    const columns = new Map();
    for (const [cx, cz] of this.neighborhood(x, z)) {
      columns.set(keyOf(cx, cz), await this.loadBase(cx, cz));
    }
    const changes = new Map();
    let active = true;
    const inside = (bx, y, bz) => this.generator.contains(bx, bz) &&
      y >= this.generator.minY && y <= this.generator.maxY;
    const access = (bx, y, bz) => {
      if (!active) throw new Error('Population callback has finished.');
      if (![bx, y, bz].every(Number.isSafeInteger)) throw new Error('Population coordinates must be integers.');
      const cx = Math.floor(bx / 16), cz = Math.floor(bz / 16), key = keyOf(cx, cz);
      if (Math.abs(cx - x) > this.stage.radius || Math.abs(cz - z) > this.stage.radius) {
        throw new Error('Population access exceeds declared neighborhood.');
      }
      return { key, cx, cz, index: indexOf(bx, y, bz) };
    };
    const world = {
      contains: (bx, y, bz) => [bx, y, bz].every(Number.isSafeInteger) && inside(bx, y, bz),
      get: (bx, y, bz) => {
        const { key, index } = access(bx, y, bz);
        if (!inside(bx, y, bz)) return 0;
        return changes.get(key)?.get(index) ?? columns.get(key).states[index];
      },
      set: (bx, y, bz, state) => {
        const { key, index } = access(bx, y, bz);
        if (!inside(bx, y, bz) || !validState(state)) throw new Error('Population write outside world or invalid block state.');
        let target = changes.get(key);
        if (!target) changes.set(key, target = new Map());
        // Keep explicit base-value writes: they may intentionally override a
        // lower-priority source at a shared destination.
        target.set(index, state);
      },
    };
    try {
      const result = this.stage.populate(world, x, z);
      if (result && typeof result.then === 'function') {
        // Consume rejection from a callback that violated the sync contract.
        Promise.resolve(result).catch(() => {});
        throw new Error('Population callback must be synchronous.');
      }
    } finally { active = false; }
    const targets = [...changes].map(([key, values]) => {
      const [cx, cz] = key.split(',').map(Number);
      return { x: cx, z: cz, changes: [...values].sort((a, b) => a[0] - b[0]) };
    });
    const record = { worldId: this.worldId, generatorId: this.generatorId, stageId: this.stage.id, x, z, targets };
    return this.validate(await this.store.savePopulation(record), x, z);
  }

  async completeColumn(x, z, base) {
    let states;
    // Every source capable of modifying this destination must finish before
    // the column becomes visible. Later sources in lexicographic order win.
    for (const [cx, cz] of this.neighborhood(x, z)) {
      const batch = await this.ensureSource(cx, cz);
      const target = batch.targets.find(t => t.x === x && t.z === z);
      if (!target) continue;
      states ??= base.states.slice();
      for (const [index, state] of target.changes) states[index] = state;
    }
    if (!states) return base;
    // Recompute section coverage if a feature adds blocks above base terrain.
    let top = states.length - 1;
    while (top > 0 && states[top] === 0) top--;
    return { ...base, states, lastSection: Math.max(this.generator.minY >> 4, top >> 12) };
  }
}
