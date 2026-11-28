// Experimental playable adapter for native 1.8.9 Default terrain + partial population.
// Preserves DefaultTerrain189's unpopulated research contract and keeps java-1.8.9-default-v1 unregistered.
import { DefaultTerrain189 } from './default.js';
import { partialPopulationSequence189 } from './population-sequence.js';
import { BLOCK_PROPERTIES_189 } from './block-properties.js';
import { fluidKind189 } from './fluids.js';
import { GrowingTerrain189 } from './growing-terrain.js';
import { collides } from '../../terrain.js';

const OCEAN_BIOMES = new Set([0, 10, 24]);
const HAZARDS = new Set([51, 81]); // fire, cactus

function spiralChunks(maxRadius) {
  const out = [[0, 0]];
  for (let r = 1; r <= maxRadius; r++) {
    for (let x = -r; x <= r; x++) out.push([x, -r], [x, r]);
    for (let z = -r + 1; z <= r - 1; z++) out.push([-r, z], [r, z]);
  }
  return out;
}

function chunkColumnsOutward(cx, cz) {
  const bx0 = cx * 16, bz0 = cz * 16;
  const cols = [];
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const dist = (lx - 7.5) ** 2 + (lz - 7.5) ** 2;
      cols.push({ x: bx0 + lx, z: bz0 + lz, dist });
    }
  }
  cols.sort((a, b) => a.dist - b.dist);
  return cols;
}

function hasDryLand(raw) {
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const colOffset = (lz << 4) | lx;
      for (let y = 254; y >= 62; y--) {
        const state = raw.states[(y << 8) | colOffset];
        if (!state) continue;
        if (state !== 144 && raw.states[((y + 1) << 8) | colOffset] === 0) return true;
        break;
      }
    }
  }
  return false;
}

export class ExperimentalDefaultTerrain189 {
  constructor(seed) {
    this.seed = seed;
    this.terrain = new DefaultTerrain189(BigInt(seed));
    this.chunkLimit = 1875000;
    this.viewDistanceLimit = 8;
    this.minY = 0;
    this.maxY = 255;
    this.biomeCache = new Map();
    this.execute = partialPopulationSequence189({
      biomeAt: (x, z) => this.biomeAt(x, z),
      missing: 'skip-experimental',
    });
  }

  contains(x, z) {
    const edge = this.chunkLimit * 16;
    return x >= -edge && x < edge && z >= -edge && z < edge;
  }

  seedBiomes(cx, cz, biomes) {
    const key = `${cx},${cz}`;
    this.biomeCache.delete(key);
    this.biomeCache.set(key, biomes);
    if (this.biomeCache.size > 256) this.biomeCache.delete(this.biomeCache.keys().next().value);
  }

  biomeAt(x, z) {
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    const key = `${cx},${cz}`;
    let chunkBiomes = this.biomeCache.get(key);
    if (chunkBiomes) {
      this.biomeCache.delete(key);
      this.biomeCache.set(key, chunkBiomes);
    } else {
      chunkBiomes = this.terrain.biomes.sample(cx * 16, cz * 16, 16, 16);
      this.seedBiomes(cx, cz, chunkBiomes);
    }
    return chunkBiomes[((z & 15) << 4) | (x & 15)];
  }

  column(cx, cz) {
    const col = this.terrain.carvedColumn(cx, cz);
    this.seedBiomes(cx, cz, col.biomes);
    return { states: col.states, biomes: col.biomes };
  }

  spawn() {
    const raw = this.terrain.rawColumn(0, 0);
    for (let y = 254; y >= 1; y--) {
      if (raw.states[(y << 8) | (8 << 4) | 8]) {
        return { x: 8.5, y: y + 1, z: 8.5, yaw: 0, pitch: 0 };
      }
    }
    return { x: 8.5, y: 64, z: 8.5, yaw: 0, pitch: 0 };
  }
}

export function createExperimentalGrowingTerrain(generator, state, store) {
  return new GrowingTerrain189(generator, state, store, generator.execute);
}

// Select and verify a safe spawn directly against prepared/populated state.
export async function findSafeExperimentalSpawn(generator, terrain) {
  const candidates = spiralChunks(12);
  for (const [cx, cz] of candidates) {
    const raw = generator.terrain.rawColumn(cx, cz);
    const centerBiome = raw.biomes[(8 << 4) | 8];
    if (OCEAN_BIOMES.has(centerBiome) && !hasDryLand(raw)) continue;
    if (!hasDryLand(raw)) continue;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        await terrain.prepare(cx + dx, cz + dz);
      }
    }

    const cols = chunkColumnsOutward(cx, cz);
    for (const allowLeaves of [false, true]) {
      for (const { x, z } of cols) {
        let topSolid = -1;
        for (let y = 253; y >= 1; y--) {
          const state = terrain.get(x, y, z);
          if (!state) continue;
          const id = state >> 4;
          if (fluidKind189(state)) break; // top surface is liquid; avoid drowning/lava
          if (!allowLeaves && (id === 18 || id === 161)) continue;
          if (BLOCK_PROPERTIES_189[id]?.[5] && !HAZARDS.has(id)) {
            topSolid = y;
            break;
          }
        }
        if (topSolid < 62) continue;
        const spawnY = topSolid + 1;
        // Require open sky (or leaf cover on fallback) above feet/head and no fluid or collision.
        let blockedAbove = false;
        for (let ay = spawnY; ay <= 255; ay++) {
          const st = terrain.get(x, ay, z);
          if (!st) continue;
          const aid = st >> 4;
          if (fluidKind189(st) || (BLOCK_PROPERTIES_189[aid]?.[5] && (!allowLeaves || (aid !== 18 && aid !== 161)))) {
            blockedAbove = true;
            break;
          }
        }
        if (blockedAbove) continue;
        const pos = { x: x + 0.5, y: spawnY, z: z + 0.5, yaw: 0, pitch: 0 };
        if (!collides(terrain, pos)) return pos;
      }
    }
  }

  // Fallback for ocean-only seeds within search radius: prepare spawn 2x2 and place above sea level.
  for (let dx = 0; dx <= 1; dx++) {
    for (let dz = 0; dz <= 1; dz++) {
      await terrain.prepare(dx, dz);
    }
  }
  let y = 63;
  while (y < 254 && (terrain.get(8, y, 8) || terrain.get(8, y + 1, 8))) y++;
  return { x: 8.5, y, z: 8.5, yaw: 0, pitch: 0 };
}
