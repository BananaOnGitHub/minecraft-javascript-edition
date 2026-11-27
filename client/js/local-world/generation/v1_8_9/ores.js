// Minecraft 1.8.9 ore vein generation (WorldGenMinable + BiomeDecorator + Extreme Hills).
// Verified against black-box 1.8.9 server stage fixtures.
import { sin189, cos189 } from './carvers.js';

const f = Math.fround;
const PI_F = f(Math.PI);
const EMERALD_ORE = 129 << 4; // 2064
const MONSTER_EGG = 97 << 4; // 1552

export const STANDARD_ORES_189 = [
  { state: 3 << 4, size: 33, count: 10, minY: 0, maxY: 256, spread: false }, // dirt
  { state: 13 << 4, size: 33, count: 8, minY: 0, maxY: 256, spread: false }, // gravel
  { state: (1 << 4) | 3, size: 33, count: 10, minY: 0, maxY: 80, spread: false }, // diorite
  { state: (1 << 4) | 1, size: 33, count: 10, minY: 0, maxY: 80, spread: false }, // granite
  { state: (1 << 4) | 5, size: 33, count: 10, minY: 0, maxY: 80, spread: false }, // andesite
  { state: 16 << 4, size: 17, count: 20, minY: 0, maxY: 128, spread: false }, // coal_ore
  { state: 15 << 4, size: 9, count: 20, minY: 0, maxY: 64, spread: false }, // iron_ore
  { state: 14 << 4, size: 9, count: 2, minY: 0, maxY: 32, spread: false }, // gold_ore
  { state: 73 << 4, size: 8, count: 8, minY: 0, maxY: 16, spread: false }, // redstone_ore
  { state: 56 << 4, size: 8, count: 1, minY: 0, maxY: 16, spread: false }, // diamond_ore
  { state: 21 << 4, size: 7, count: 1, centerY: 16, spreadY: 16, spread: true }, // lapis_ore
];

export const EXTREME_HILLS_BIOMES = new Set([3, 20, 34, 131, 162]);

// BlockHelper.forBlock(Blocks.stone) matches block ID 1 (stone, granite, diorite, andesite).
const defaultStonePredicate = state => (state >> 4) === 1;

/**
 * Place a single WorldGenMinable vein in a block accessor { get(x,y,z), set(x,y,z,state) }.
 */
export function generateMinable189(world, random, originX, originY, originZ, state, count, canReplace = defaultStonePredicate) {
  const angle = f(random.nextFloat() * PI_F);
  const sinStep = f(f(sin189(angle) * count) / 8);
  const cosStep = f(f(cos189(angle) * count) / 8);
  const x0 = f(f(originX + 8) + sinStep);
  const x1 = f(f(originX + 8) - sinStep);
  const z0 = f(f(originZ + 8) + cosStep);
  const z1 = f(f(originZ + 8) - cosStep);
  const y0 = originY + random.nextInt(3) - 2;
  const y1 = originY + random.nextInt(3) - 2;

  for (let i = 0; i < count; i++) {
    const t = f(i / count);
    const cx = x0 + (x1 - x0) * t;
    const cy = y0 + (y1 - y0) * t;
    const cz = z0 + (z1 - z0) * t;
    const size = random.nextDouble() * count / 16;
    const diameter = f(sin189(f(t * PI_F)) + 1) * size + 1;
    const rx = diameter / 2;
    const ry = diameter / 2;

    const minX = Math.floor(cx - rx);
    const minY = Math.floor(cy - ry);
    const minZ = Math.floor(cz - rx);
    const maxX = Math.floor(cx + rx);
    const maxY = Math.floor(cy + ry);
    const maxZ = Math.floor(cz + rx);

    for (let x = minX; x <= maxX; x++) {
      const dx = (x + 0.5 - cx) / rx;
      if (dx * dx >= 1) continue;
      for (let y = minY; y <= maxY; y++) {
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy >= 1) continue;
        for (let z = minZ; z <= maxZ; z++) {
          const dz = (z + 0.5 - cz) / rx;
          if (dx * dx + dy * dy + dz * dz < 1 && y >= 0 && y < 256 && canReplace(world.get(x, y, z))) {
            world.set(x, y, z, state);
          }
        }
      }
    }
  }
}

export function genStandardOre1(world, random, baseX, baseZ, count, state, size, minY, maxY) {
  if (maxY < minY) {
    const tmp = minY;
    minY = maxY;
    maxY = tmp;
  } else if (maxY === minY) {
    if (minY < 255) maxY++;
    else minY--;
  }
  const range = maxY - minY;
  for (let i = 0; i < count; i++) {
    const x = baseX + random.nextInt(16);
    const y = random.nextInt(range) + minY;
    const z = baseZ + random.nextInt(16);
    generateMinable189(world, random, x, y, z, state, size);
  }
}

export function genStandardOre2(world, random, baseX, baseZ, count, state, size, centerY, spreadY) {
  for (let i = 0; i < count; i++) {
    const x = baseX + random.nextInt(16);
    const y = random.nextInt(spreadY) + random.nextInt(spreadY) + centerY - spreadY;
    const z = baseZ + random.nextInt(16);
    generateMinable189(world, random, x, y, z, state, size);
  }
}

export function generateStandardOres189(world, random, baseX, baseZ) {
  for (const ore of STANDARD_ORES_189) {
    if (ore.spread) genStandardOre2(world, random, baseX, baseZ, ore.count, ore.state, ore.size, ore.centerY, ore.spreadY);
    else genStandardOre1(world, random, baseX, baseZ, ore.count, ore.state, ore.size, ore.minY, ore.maxY);
  }
}

export function generateExtremeHillsOres189(world, random, baseX, baseZ) {
  const count = 3 + random.nextInt(6);
  for (let i = 0; i < count; i++) {
    const x = baseX + random.nextInt(16);
    const y = random.nextInt(28) + 4;
    const z = baseZ + random.nextInt(16);
    if ((world.get(x, y, z) >> 4) === 1) world.set(x, y, z, EMERALD_ORE);
  }
  genStandardOre1(world, random, baseX, baseZ, 7, MONSTER_EGG, 9, 0, 64);
}
