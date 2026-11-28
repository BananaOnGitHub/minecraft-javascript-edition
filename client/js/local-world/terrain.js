import { LandscapeTerrain } from './landscape.js';
import { worldSettings } from './world-settings.js';
import { LayeredFlatTerrain } from './flat-world.js';
import { validateGenerator } from './world-metadata.js';
import { EXPERIMENTAL_DEFAULT_189 } from './generation/v1_8_9/stateful-population.js';
import { ExperimentalDefaultTerrain189 } from './generation/v1_8_9/experimental-default.js';

export const CHUNK_LIMIT = 8;
export const FOUNDATION_Y = 48;
export const BUILD_CEILING = 111;

// Protocol-facing block IDs for solid, full-cube materials in the building palette.
export const MATERIALS = [1, 5, 24, 35, 45, 98];
export const PLACEABLE_MATERIALS = new Set([...MATERIALS, 2, 3, 12, 13, 15, 16, 17, 18, 20, 80]);
const SOLID_BASE = 7 << 4;

function hash(x, z, seed) {
  let n = seed ^ Math.imul(x, 0x85ebca77) ^ Math.imul(z, 0xc2b2ae3d);
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  return (n ^ (n >>> 15)) >>> 0;
}

export function seedNumber(seed) {
  let n = 2166136261;
  for (const char of seed) n = Math.imul(n ^ char.codePointAt(0), 16777619);
  return n >>> 0;
}

export function inside(x, z) {
  const edge = CHUNK_LIMIT * 16;
  return x >= -edge && x < edge && z >= -edge && z < edge;
}

export class TerraceTerrain {
  constructor(seed, edits = []) {
    this.seed = seed;
    this.edits = new Map(edits);
    this.chunkLimit = CHUNK_LIMIT;
    this.viewDistanceLimit = 4;
    this.minY = FOUNDATION_Y;
    this.maxY = BUILD_CEILING;
  }

  contains(x, z) { return inside(x, z); }
  get editCount() { return this.edits.size; }

  spawn() { return { x: 0.5, y: 56, z: 0.5, yaw: 0, pitch: 0 }; }

  column(cx, cz) {
    const states = new Uint16Array(65536);
    const biomes = new Uint8Array(256).fill(1);
    for (let y = this.minY; y <= this.maxY; y++) {
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) states[y * 256 + z * 16 + x] = this.get(cx * 16 + x, y, cz * 16 + z);
      }
    }
    return { states, biomes, lastSection: this.maxY >> 4 };
  }

  surface(x, z) {
    const a = Math.floor((x + 6) / 12);
    const b = Math.floor((z + 6) / 12);
    if (a === 0 || b === 0 || a % 3 === 0 || b % 3 === 0) return 55;
    return 56 + hash(a, b, this.seed) % 4;
  }

  base(x, y, z) {
    if (y < FOUNDATION_Y || !inside(x, z)) return 0;
    if (y === FOUNDATION_Y) return SOLID_BASE;
    const surface = this.surface(x, z);
    if (y > surface) return 0;
    if (y < surface) return 1 << 4;
    return (surface === 55 ? 98 : 24) << 4;
  }

  get(x, y, z) {
    if (!inside(x, z) || y < FOUNDATION_Y || y > BUILD_CEILING) return 0;
    return this.edits.get(pack(x, y, z)) ?? this.base(x, y, z);
  }

  set(x, y, z, state) {
    const key = pack(x, y, z);
    if (state === this.base(x, y, z)) this.edits.delete(key);
    else this.edits.set(key, state);
  }

  snapshot() {
    return [...this.edits];
  }
}

export function createTerrain(state) {
  if (state.version === 1) return new TerraceTerrain(state.seed, state.edits);
  validateGenerator(state);
  if (state.version === 3 && state.generator.id === 'layered-flat-v1') {
    return new LayeredFlatTerrain(state.seed, state.generator.configuration, state.edits);
  }
  if (state.version === 3 && state.generator.id === EXPERIMENTAL_DEFAULT_189.id) {
    return new ExperimentalDefaultTerrain189(state.seed);
  }
  const settings = worldSettings(state.settings);
  if (settings.worldType === 'terraces') {
    const terrain = new TerraceTerrain(seedNumber(state.seed), state.version === 3 ? [] : state.edits);
    if (state.version === 3) {
      for (const [key, changes] of state.edits) {
        const [cx, cz] = key.split(',').map(Number);
        for (const [index, value] of changes) terrain.set(cx * 16 + (index & 15), index >> 8, cz * 16 + ((index >> 4) & 15), value);
      }
    }
    return terrain;
  }
  return new LandscapeTerrain(state.seed, settings, state.edits);
}

export function isWater(state) {
  const id = state >> 4;
  return id === 8 || id === 9;
}

// A bounded coordinate key. Callers validate the world bounds before setting edits.
function pack(x, y, z) {
  return (y * 256 + z + 128) * 256 + x + 128;
}

export function playerBox({ x, y, z }) {
  const radius = Math.fround(0.6) / 2;
  return [x - radius, y, z - radius, x + radius, y + Math.fround(1.8), z + radius];
}

const PASSABLE_IDS = new Set([6, 8, 9, 10, 11, 31, 32, 37, 38, 39, 40, 83, 106, 175]);

export function collides(terrain, position) {
  const box = playerBox(position);
  const epsilon = 0.00001;
  if (!terrain.contains(box[0] + epsilon, box[2] + epsilon) ||
      !terrain.contains(box[3] - epsilon, box[5] - epsilon) ||
      box[1] < terrain.minY || box[4] > terrain.maxY + 12) return true;

  for (let y = Math.floor(box[1] + epsilon); y <= Math.floor(box[4] - epsilon); y++) {
    for (let z = Math.floor(box[2] + epsilon); z <= Math.floor(box[5] - epsilon); z++) {
      for (let x = Math.floor(box[0] + epsilon); x <= Math.floor(box[3] - epsilon); x++) {
        const state = terrain.get(x, y, z);
        if (state && !PASSABLE_IDS.has(state >> 4) && state !== (78 << 4)) return true;
      }
    }
  }
  return false;
}
