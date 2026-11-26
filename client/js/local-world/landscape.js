import { seedWords, worldSettings } from './world-settings.js';

const AIR = 0;
const STONE = 1 << 4;
const GRASS = 2 << 4;
const DIRT = 3 << 4;
const BASE = 7 << 4;
const WATER = 9 << 4;
const SAND = 12 << 4;
const GRAVEL = 13 << 4;
const LOG = 17 << 4;
const LEAVES = 18 << 4;
const SANDSTONE = 24 << 4;
const SNOW = 80 << 4;
const MASONRY = 98 << 4;
const COAL = 16 << 4;
const IRON = 15 << 4;
const SEA_LEVEL = 62;
const CHUNK_CACHE_LIMIT = 96;

const PRESETS = {
  natural: { scale: 96, relief: 21, regionScale: 112, detail: 9 },
  highlands: { scale: 108, relief: 55, regionScale: 130, detail: 15 },
  wide: { scale: 220, relief: 25, regionScale: 300, detail: 8 },
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

function index(x, y, z) {
  return y * 256 + z * 16 + x;
}

function columnKey(x, z) {
  return x + ',' + z;
}

// Separate seed words preserve the entropy in large numeric seeds. Coordinates
// are sampled in world space so adjacent chunks share the same noise field.
function hash(x, z, lo, hi, salt) {
  let n = lo ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(z, 0x85ebca77) ^ salt;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d) ^ hi;
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}

export class LandscapeTerrain {
  constructor(seed, settings, edits = []) {
    this.seed = seed;
    this.settings = worldSettings(settings);
    if (this.settings.worldType === 'terraces') throw new Error('Terraces use a separate generator.');
    this.preset = this.settings.worldType === 'custom' ? {
      scale: Math.round(this.settings.regionSize * 0.86),
      relief: this.settings.relief,
      regionScale: this.settings.regionSize,
      detail: Math.max(2, Math.round(this.settings.relief * 0.42)),
    } : PRESETS[this.settings.worldType];
    this.baseHeight = this.settings.baseHeight ?? 67;
    this.waterLevel = this.settings.waterLevel ?? SEA_LEVEL;
    [this.lo, this.hi] = seedWords(seed);
    // The existing client supports 22-bit chunk coordinates and 16 vertical
    // sections. Limit generation to its supported horizontal viewing range.
    this.chunkLimit = 1875000;
    this.viewDistanceLimit = 8;
    this.minY = 0;
    this.maxY = 255;
    this.cache = new Map();
    this.edits = new Map(edits.map(([key, changes]) => [key, new Map(changes)]));
    this.editCount = [...this.edits.values()].reduce((count, changes) => count + changes.size, 0);
  }

  contains(x, z) {
    const edge = this.chunkLimit * 16;
    return x >= -edge && x < edge && z >= -edge && z < edge;
  }

  random(x, z, salt) {
    return hash(x, z, this.lo, this.hi, salt) / 4294967296;
  }

  noise(x, z, scale, salt) {
    const gx = Math.floor(x / scale);
    const gz = Math.floor(z / scale);
    const tx = fade(x / scale - gx);
    const tz = fade(z / scale - gz);
    const a = lerp(this.random(gx, gz, salt), this.random(gx + 1, gz, salt), tx);
    const b = lerp(this.random(gx, gz + 1, salt), this.random(gx + 1, gz + 1, salt), tx);
    return lerp(a, b, tz) * 2 - 1;
  }

  sample(x, z) {
    if (this.settings.worldType === 'flat') {
      return { height: 63, top: GRASS, soil: DIRT, biome: 1, cover: 0.12 };
    }

    const { scale, relief, regionScale, detail } = this.preset;
    const broad = this.noise(x, z, scale, 0x14cf);
    const hills = this.noise(x, z, scale / 2.5, 0xd31b);
    const fine = this.noise(x, z, 13, 0xc24d);
    const height = Math.max(12, Math.min(204,
      Math.round(this.baseHeight + relief * broad + detail * hills + fine * 2.5)));

    const heat = this.noise(x, z, regionScale, 0x6ac2) - Math.max(0, height - 91) / 80;
    const moisture = this.noise(x, z, regionScale * 0.85, 0x913a);
    if (this.settings.lakes && height < this.waterLevel - 1) {
      return { height, top: GRAVEL, soil: GRAVEL, biome: 0, cover: 0 };
    }
    if (this.settings.lakes && height <= this.waterLevel + 2) {
      return { height, top: SAND, soil: SANDSTONE, biome: 16, cover: 0 };
    }
    if (heat < -0.55 || height > 126) {
      return { height, top: SNOW, soil: DIRT, biome: 12, cover: height > 126 ? 0 : 0.13 };
    }
    if (heat > 0.35 && moisture < -0.2) {
      return { height, top: SAND, soil: SANDSTONE, biome: 2, cover: 0 };
    }
    if (height > 106) {
      return { height, top: STONE, soil: STONE, biome: 3, cover: 0.04 };
    }
    if (moisture > 0.05) {
      return { height, top: GRASS, soil: DIRT, biome: 4, cover: 0.72 };
    }
    return { height, top: GRASS, soil: DIRT, biome: 1, cover: 0.17 };
  }

  surface(x, z) {
    return this.sample(x, z).height;
  }

  // Feature anchors are tied to a global grid. Include the margin around the
  // requested chunk so features are identical regardless of generation order.
  anchors(cx, cz, spacing, margin, salt, visit) {
    const x0 = cx * 16;
    const z0 = cz * 16;
    for (let gz = Math.floor((z0 - margin) / spacing); gz <= Math.floor((z0 + 15 + margin) / spacing); gz++) {
      for (let gx = Math.floor((x0 - margin) / spacing); gx <= Math.floor((x0 + 15 + margin) / spacing); gx++) {
        const x = gx * spacing + Math.floor(this.random(gx, gz, salt) * spacing);
        const z = gz * spacing + Math.floor(this.random(gx, gz, salt + 1) * spacing);
        if (this.contains(x, z)) visit(x, z, gx, gz);
      }
    }
  }

  generate(cx, cz) {
    const states = new Uint16Array(65536);
    const biomes = new Uint8Array(256);
    const heights = new Uint8Array(256);
    const x0 = cx * 16;
    const z0 = cz * 16;
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const column = this.sample(x0 + x, z0 + z);
        const h = column.height;
        heights[z * 16 + x] = h;
        biomes[z * 16 + x] = column.biome;
        states[index(x, 0, z)] = BASE;
        for (let y = 1; y < h - 3; y++) states[index(x, y, z)] = STONE;
        for (let y = h - 3; y < h; y++) states[index(x, y, z)] = column.soil;
        states[index(x, h, z)] = column.top;
        if (this.settings.lakes) {
          for (let y = h + 1; y <= this.waterLevel; y++) states[index(x, y, z)] = WATER;
        }
      }
    }

    const write = (x, y, z, state, replace) => {
      const lx = x - x0;
      const lz = z - z0;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 1 || y > 255) return;
      const i = index(lx, y, lz);
      if (replace(states[i], heights[lz * 16 + lx], y)) states[i] = state;
    };

    const sphere = (x, y, z, radius, verticalRadius, state, replace) => {
      for (let wz = Math.max(z0, z - radius); wz <= Math.min(z0 + 15, z + radius); wz++) {
        for (let wx = Math.max(x0, x - radius); wx <= Math.min(x0 + 15, x + radius); wx++) {
          for (let wy = y - verticalRadius; wy <= y + verticalRadius; wy++) {
            if (((wx - x) ** 2 + (wz - z) ** 2) / radius ** 2 + (wy - y) ** 2 / verticalRadius ** 2 <= 1) {
              write(wx, wy, wz, state, replace);
            }
          }
        }
      }
    };

    if (this.settings.caverns) {
      this.anchors(cx, cz, 28, 14, 0x2f03, (x, z, gx, gz) => {
        if (this.random(gx, gz, 0x2f05) < 0.28) return;
        const depth = 9 + Math.floor(this.random(gx, gz, 0x2f06) * 35);
        const y = Math.max(9, this.surface(x, z) - depth);
        const radius = 5 + Math.floor(this.random(gx, gz, 0x2f07) * 9);
        const verticalRadius = 3 + Math.floor(radius / 3);
        sphere(x, y, z, radius, verticalRadius, AIR, (old, h, wy) => old !== WATER && wy < h - 3);
      });
      this.anchors(cx, cz, 11, 4, 0x46d1, (x, z, gx, gz) => {
        const y = 3 + Math.floor(this.random(gx, gz, 0x46d3) * Math.max(1, this.surface(x, z) - 9));
        const state = this.random(gx, gz, 0x46d4) < 0.25 ? IRON : COAL;
        sphere(x, y, z, 2, 1, state, old => old === STONE);
      });
    }

    if (this.settings.landmarks) {
      this.anchors(cx, cz, 80, 4, 0x59d1, (x, z, gx, gz) => {
        if (this.random(gx, gz, 0x59d3) < 0.45) return;
        const column = this.sample(x, z);
        if (column.top === GRAVEL || column.top === SAND) return;
        const h = column.height + 1;
        const air = old => old === AIR;
        // An occasional weathered stone marker with four low arms and a
        // narrow central column, following the local ground elevation.
        for (const [dx, dz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) {
          const base = this.surface(x + dx, z + dz) + 1;
          write(x + dx, base, z + dz, MASONRY, air);
          write(x + dx, base + 1, z + dz, MASONRY, air);
        }
        for (let y = h + 2; y < h + 6; y++) write(x, y, z, MASONRY, air);
      });
    }

    if (this.settings.trees) {
      this.anchors(cx, cz, 7, 3, 0x79b1, (x, z, gx, gz) => {
        const column = this.sample(x, z);
        if (this.random(gx, gz, 0x79b3) >= column.cover ||
            (this.settings.lakes && column.height <= this.waterLevel + 2)) return;
        if (Math.abs(this.surface(x + 1, z) - column.height) > 2 ||
            Math.abs(this.surface(x, z + 1) - column.height) > 2) return;
        const h = column.height + 1;
        const trunk = 4 + Math.floor(this.random(gx, gz, 0x79b4) * 4);
        const crown = h + trunk - 1;
        const air = old => old === AIR;
        for (let dy = -2; dy <= 2; dy++) {
          const radius = Math.abs(dy) === 2 ? 1 : 2;
          for (let dz = -radius; dz <= radius; dz++) {
            for (let dx = -radius; dx <= radius; dx++) {
              if (dx * dx + dz * dz <= radius * radius + 1) {
                write(x + dx, crown + dy, z + dz, LEAVES, air);
              }
            }
          }
        }
        for (let dy = 0; dy < trunk; dy++) {
          write(x, h + dy, z, LOG, old => old === AIR || old === LEAVES);
        }
      });
    }

    return { states, biomes };
  }

  baseColumn(cx, cz) {
    const key = columnKey(cx, cz);
    let column = this.cache.get(key);
    if (column) this.cache.delete(key);
    else column = this.generate(cx, cz);
    this.cache.set(key, column);
    if (this.cache.size > CHUNK_CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value);
    return column;
  }

  column(cx, cz) {
    const base = this.baseColumn(cx, cz);
    const changes = this.edits.get(columnKey(cx, cz));
    if (!changes) return base;
    const states = base.states.slice();
    for (const [i, state] of changes) states[i] = state;
    return { states, biomes: base.biomes };
  }

  get(x, y, z) {
    if (!this.contains(x, z) || y < this.minY || y > this.maxY) return AIR;
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    const i = index(x & 15, y, z & 15);
    return this.edits.get(columnKey(cx, cz))?.get(i) ?? this.baseColumn(cx, cz).states[i];
  }

  set(x, y, z, state) {
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    const key = columnKey(cx, cz);
    const i = index(x & 15, y, z & 15);
    let changes = this.edits.get(key);
    const base = this.baseColumn(cx, cz).states[i];
    if (state === base) {
      if (changes?.delete(i)) this.editCount--;
      if (changes?.size === 0) this.edits.delete(key);
      return;
    }
    if (!changes) {
      changes = new Map();
      this.edits.set(key, changes);
    }
    if (!changes.has(i)) this.editCount++;
    changes.set(i, state);
  }

  snapshot() {
    return [...this.edits].map(([key, changes]) => [key, [...changes]]);
  }

  spawn() {
    // Search outward for a dry column with headroom; keep the starting area
    // close to the seed's origin when the terrain permits.
    const candidate = (x, z) => {
      const y = this.surface(x, z) + 1;
      if (this.settings.lakes && y <= this.waterLevel + 1) return null;
      if (this.get(x, y, z) || this.get(x, y + 1, z)) return null;
      return { x: x + 0.5, y, z: z + 0.5, yaw: 0, pitch: 0 };
    };
    const origin = candidate(0, 0);
    if (origin) return origin;
    for (let radius = 8; radius <= 1024; radius += 8) {
      for (let offset = -radius; offset <= radius; offset += 8) {
        for (const [x, z] of [[offset, -radius], [offset, radius], [-radius, offset], [radius, offset]]) {
          const position = candidate(x, z);
          if (position) return position;
        }
      }
    }
    // Only reached when the entire search area lacks dry ground.
    let y = Math.max(this.surface(0, 0) + 1, this.waterLevel + 1);
    while (this.get(0, y, 0) || this.get(0, y + 1, 0)) y++;
    return { x: 0.5, y, z: 0.5, yaw: 0, pitch: 0 };
  }
}
