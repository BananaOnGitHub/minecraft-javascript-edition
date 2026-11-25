export const CHUNK_LIMIT = 8;
export const FOUNDATION_Y = 48;
export const BUILD_CEILING = 111;

// Protocol-facing block IDs for solid, full-cube materials in the building palette.
export const MATERIALS = [1, 5, 24, 35, 45, 98];
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

// A bounded coordinate key. Callers validate the world bounds before setting edits.
function pack(x, y, z) {
  return (y * 256 + z + 128) * 256 + x + 128;
}

export function playerBox({ x, y, z }) {
  const radius = Math.fround(0.6) / 2;
  return [x - radius, y, z - radius, x + radius, y + Math.fround(1.8), z + radius];
}

export function collides(terrain, position) {
  const box = playerBox(position);
  const epsilon = 0.00001;
  if (!inside(box[0] + epsilon, box[2] + epsilon) ||
      !inside(box[3] - epsilon, box[5] - epsilon) ||
      box[1] < FOUNDATION_Y || box[4] > BUILD_CEILING + 12) return true;

  for (let y = Math.floor(box[1] + epsilon); y <= Math.floor(box[4] - epsilon); y++) {
    for (let z = Math.floor(box[2] + epsilon); z <= Math.floor(box[5] - epsilon); z++) {
      for (let x = Math.floor(box[0] + epsilon); x <= Math.floor(box[3] - epsilon); x++) {
        if (terrain.get(x, y, z)) return true;
      }
    }
  }
  return false;
}
