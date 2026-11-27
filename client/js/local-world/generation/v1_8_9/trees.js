/**
 * Native Minecraft Java Edition 1.8.9 tree generators.
 *
 * Implements all 11 Overworld tree generators matching Java 1.8.9 PRNG consumption,
 * block geometry, metadata (log axis, leaf decay/variant bits, cocoa age/facing, vines),
 * and BlockLeaves breakBlock neighbor check_decay side effects.
 */

import { JavaRandom } from '../../java-random.js';

const LOG_OAK = (17 << 4) | 0;
const LOG_SPRUCE = (17 << 4) | 1;
const LOG_BIRCH = (17 << 4) | 2;
const LOG_JUNGLE = (17 << 4) | 3;
const LOG_ACACIA = (162 << 4) | 0;
const LOG_DARK_OAK = (162 << 4) | 1;

const LEAVES_OAK = (18 << 4) | 0;
const LEAVES_SPRUCE = (18 << 4) | 1;
const LEAVES_BIRCH = (18 << 4) | 2;
const LEAVES_JUNGLE = (18 << 4) | 3;
const LEAVES_OAK_DEFAULT = (18 << 4) | 8; // check_decay=true on BlockLeaves default state (shrub)
const LEAVES_ACACIA = (161 << 4) | 0;
const LEAVES_DARK_OAK = (161 << 4) | 1;

const DIRT = (3 << 4) | 0;
const PODZOL = (3 << 4) | 2;

// Vine directions: South=1, West=2, North=4, East=8
const VINE_SOUTH = (106 << 4) | 1;
const VINE_WEST = (106 << 4) | 2;
const VINE_NORTH = (106 << 4) | 4;
const VINE_EAST = (106 << 4) | 8;

// EnumFacing.Plane.HORIZONTAL iteration order in 1.8.9: NORTH, EAST, SOUTH, WEST
const HORIZ_FACINGS = [
  { meta: 2, dx: 0, dz: -1, oppX: 0, oppZ: 1 },  // NORTH (opp = SOUTH)
  { meta: 3, dx: 1, dz: 0, oppX: -1, oppZ: 0 },  // EAST (opp = WEST)
  { meta: 0, dx: 0, dz: 1, oppX: 0, oppZ: -1 },  // SOUTH (opp = NORTH)
  { meta: 1, dx: -1, dz: 0, oppX: 1, oppZ: 0 },  // WEST (opp = EAST)
];

function isLeafId(id) {
  return id === 18 || id === 161;
}

function isAirOrLeaves(id) {
  return id === 0 || id === 18 || id === 161;
}

// WorldGenAbstractTree.func_150523_a (canGrowInto)
function canGrowInto(id) {
  return (
    id === 0 ||
    id === 18 ||
    id === 161 ||
    id === 2 ||
    id === 3 ||
    id === 17 ||
    id === 162 ||
    id === 6 ||
    id === 106
  );
}

function isSoil(id) {
  return id === 2 || id === 3 || id === 60;
}

function isGrassOrDirt(id) {
  return id === 2 || id === 3;
}

// Matches Chunk.setBlockState -> BlockLeaves.breakBlock marking neighboring leaves check_decay=true
export function setBlockWithLeafBreak(world, x, y, z, state) {
  if (y < 0 || y >= 256) return;
  const prev = world.get(x, y, z);
  world.set(x, y, z, state);
  const prevId = prev >> 4;
  if (isLeafId(prevId) && (state >> 4) !== prevId) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const ny = y + dy;
          if (ny < 0 || ny >= 256) continue;
          const n = world.get(x + dx, ny, z + dz);
          if (isLeafId(n >> 4) && (n & 8) === 0) {
            world.set(x + dx, ny, z + dz, n | 8);
          }
        }
      }
    }
  }
}

function setDirtAt(world, x, y, z) {
  if (y >= 0 && y < 256 && (world.get(x, y, z) >> 4) !== 3) {
    setBlockWithLeafBreak(world, x, y, z, DIRT);
  }
}

function canReplaceForLeaf(world, x, y, z) {
  const id = world.get(x, y, z) >> 4;
  return id === 0 || isLeafId(id);
}

function isNonFullBlock(world,x,y,z) {
  const state=world.get(x,y,z);
  return world.isFullCube?!world.isFullCube(state):state===0;
}

function addVine(world, x, y, z, vineState) {
  setBlockWithLeafBreak(world, x, y, z, vineState);
}

function addHangingVine(world, x, y, z, vineState) {
  addVine(world, x, y, z, vineState);
  let i = 4;
  let py = y - 1;
  while ((world.get(x, py, z) >> 4) === 0 && i > 0) {
    addVine(world, x, py, z, vineState);
    py--;
    i--;
  }
}

function addCocoa(world, x, y, z, age, facingMeta) {
  setBlockWithLeafBreak(world, x, y, z, (127 << 4) | ((age & 3) << 2) | (facingMeta & 3));
}

function isSpaceClear2x2(world, x, y, z, height) {
  if (y < 1 || y + height + 1 > 256) return false;
  for (let cy = 0; cy <= 1 + height; cy++) {
    let radius = 2;
    if (cy === 0) radius = 1;
    else if (cy >= 1 + height - 2) radius = 2;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (y + cy < 0 || y + cy >= 256 || !canGrowInto(world.get(x + dx, y + cy, z + dz) >> 4)) {
          return false;
        }
      }
    }
  }
  return true;
}

function ensure2x2Soil(world, x, y, z) {
  const b00 = world.get(x, y - 1, z) >> 4;
  // The anchor soil gates the attempt; the other three support blocks are
  // converted even on a slope. Requiring four pre-existing soils rejects it.
  if (!isGrassOrDirt(b00) || y < 2) {
    return false;
  }
  setDirtAt(world, x, y - 1, z);
  setDirtAt(world, x + 1, y - 1, z);
  setDirtAt(world, x, y - 1, z + 1);
  setDirtAt(world, x + 1, y - 1, z + 1);
  return true;
}

/**
 * 1. WorldGenTrees (oak / jungle small tree with optional vines & cocoa)
 */
export function generateOakTree189(
  world,
  rand,
  x,
  y,
  z,
  minTreeHeight = 4,
  logState = LOG_OAK,
  leafState = LEAVES_OAK,
  vinesGrow = false
) {
  const height = rand.nextInt(3) + minTreeHeight;
  if (y < 1 || y + height + 1 > 256) return false;

  for (let cy = y; cy <= y + 1 + height; cy++) {
    let radius = 1;
    if (cy === y) radius = 0;
    if (cy >= y + 1 + height - 2) radius = 2;
    for (let cx = x - radius; cx <= x + radius; cx++) {
      for (let cz = z - radius; cz <= z + radius; cz++) {
        if (cy < 0 || cy >= 256 || !canGrowInto(world.get(cx, cy, cz) >> 4)) {
          return false;
        }
      }
    }
  }

  const belowId = world.get(x, y - 1, z) >> 4;
  if (!isSoil(belowId) || y >= 256 - height - 1) return false;
  setDirtAt(world, x, y - 1, z);

  for (let cy = y - 3 + height; cy <= y + height; cy++) {
    const dy = cy - (y + height);
    const radius = Math.floor(1 - dy / 2);
    for (let cx = x - radius; cx <= x + radius; cx++) {
      const dx = cx - x;
      for (let cz = z - radius; cz <= z + radius; cz++) {
        const dz = cz - z;
        if (
          Math.abs(dx) !== radius ||
          Math.abs(dz) !== radius ||
          (rand.nextInt(2) !== 0 && dy !== 0)
        ) {
          const curId = world.get(cx, cy, cz) >> 4;
          if (curId === 0 || isLeafId(curId) || curId === 106) {
            setBlockWithLeafBreak(world, cx, cy, cz, leafState);
          }
        }
      }
    }
  }

  for (let i = 0; i < height; i++) {
    const curId = world.get(x, y + i, z) >> 4;
    if (curId === 0 || isLeafId(curId) || curId === 106) {
      setBlockWithLeafBreak(world, x, y + i, z, logState);
      if (vinesGrow && i > 0) {
        if (rand.nextInt(3) > 0 && (world.get(x - 1, y + i, z) >> 4) === 0) addVine(world, x - 1, y + i, z, VINE_EAST);
        if (rand.nextInt(3) > 0 && (world.get(x + 1, y + i, z) >> 4) === 0) addVine(world, x + 1, y + i, z, VINE_WEST);
        if (rand.nextInt(3) > 0 && (world.get(x, y + i, z - 1) >> 4) === 0) addVine(world, x, y + i, z - 1, VINE_SOUTH);
        if (rand.nextInt(3) > 0 && (world.get(x, y + i, z + 1) >> 4) === 0) addVine(world, x, y + i, z + 1, VINE_NORTH);
      }
    }
  }

  if (vinesGrow) {
    for (let cy = y - 3 + height; cy <= y + height; cy++) {
      const dy = cy - (y + height);
      const radius = Math.floor(2 - dy / 2);
      for (let cx = x - radius; cx <= x + radius; cx++) {
        for (let cz = z - radius; cz <= z + radius; cz++) {
          if (isLeafId(world.get(cx, cy, cz) >> 4)) {
            if (rand.nextInt(4) === 0 && (world.get(cx - 1, cy, cz) >> 4) === 0) addHangingVine(world, cx - 1, cy, cz, VINE_EAST);
            if (rand.nextInt(4) === 0 && (world.get(cx + 1, cy, cz) >> 4) === 0) addHangingVine(world, cx + 1, cy, cz, VINE_WEST);
            if (rand.nextInt(4) === 0 && (world.get(cx, cy, cz - 1) >> 4) === 0) addHangingVine(world, cx, cy, cz - 1, VINE_SOUTH);
            if (rand.nextInt(4) === 0 && (world.get(cx, cy, cz + 1) >> 4) === 0) addHangingVine(world, cx, cy, cz + 1, VINE_NORTH);
          }
        }
      }
    }

    if (rand.nextInt(5) === 0 && height > 5) {
      for (let l3 = 0; l3 < 2; l3++) {
        for (let f = 0; f < HORIZ_FACINGS.length; f++) {
          if (rand.nextInt(4 - l3) === 0) {
            const age = rand.nextInt(3);
            const facing = HORIZ_FACINGS[f];
            addCocoa(world, x + facing.oppX, y + height - 5 + l3, z + facing.oppZ, age, facing.meta);
          }
        }
      }
    }
  }

  return true;
}

/**
 * 2. WorldGenBigTree (large branching oak)
 */
export class BigOakTree189 {
  constructor() { this.heightLimit = 0; }

  // Biome decoration's preparation hook raises foliage depth, while retaining
  // the previously selected height. Fresh isolated calls retain depth four.
  prepare() { this.leafDistanceLimit=5; }

  generate(world, rand, x, y, z) {
    return generateBigOakTree189(world, rand, x, y, z, this);
  }
}

export function generateBigOakTree189(world, rand, x, y, z, instance = { heightLimit: 0 }) {
  const treeRand = new JavaRandom(rand.nextLong());

  const heightAttenuation = 0.618;
  const branchSlope = 0.381;
  const scaleWidth = 1.0;
  const leafDensity = 1.0;
  const trunkSize = 1;
  const heightLimitLimit = 12;
  const leafDistanceLimit = instance.leafDistanceLimit??4;

  // The generator retains its selected height between calls. Only the first
  // call draws it; drawing it again shifts every subsequent foliage sample.
  if (instance.heightLimit === 0) instance.heightLimit = 5 + treeRand.nextInt(heightLimitLimit);
  let heightLimit = instance.heightLimit;

  const soilId = world.get(x, y - 1, z) >> 4;
  if (!isSoil(soilId)) return false;

  const checkBlockLine = (x1, y1, z1, x2, y2, z2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    if (dx === 0 && dy === 0 && dz === 0) return -1;
    let maxAbs = Math.abs(dx);
    if (Math.abs(dy) > maxAbs) maxAbs = Math.abs(dy);
    if (Math.abs(dz) > maxAbs) maxAbs = Math.abs(dz);
    const sx = dx / maxAbs;
    const sy = dy / maxAbs;
    const sz = dz / maxAbs;
    let i = 0;
    for (; i <= maxAbs; i++) {
      const bx = Math.floor(0.5 + x1 + i * sx);
      const by = Math.floor(0.5 + y1 + i * sy);
      const bz = Math.floor(0.5 + z1 + i * sz);
      if (!canGrowInto(world.get(bx, by, bz) >> 4)) break;
    }
    return i === maxAbs + 1 ? -1 : Math.abs(i);
  };

  const validHeight = checkBlockLine(x, y, z, x, y + heightLimit - 1, z);
  if (validHeight !== -1) {
    if (validHeight < 6) return false;
    heightLimit = validHeight;
    instance.heightLimit = heightLimit;
  }

  let height = Math.trunc(heightLimit * heightAttenuation);
  if (height >= heightLimit) height = heightLimit - 1;
  let clustersPerY = Math.trunc(1.382 + Math.pow((leafDensity * heightLimit) / 13.0, 2.0));
  if (clustersPerY < 1) clustersPerY = 1;

  const trunkTopY = y + height;
  let relY = heightLimit - leafDistanceLimit;
  const foliageCoords = [];
  foliageCoords.push([x, y + relY, z, trunkTopY]);

  while (relY >= 0) {
    const f = (() => {
      if (relY < heightLimit * 0.3) return -1.0;
      const f0 = heightLimit / 2.0;
      const f1 = f0 - relY;
      let f2 = Math.fround(Math.sqrt(f0 * f0 - f1 * f1));
      if (f1 === 0.0) f2 = f0;
      else if (Math.abs(f1) >= f0) f2 = 0.0;
      return f2 * 0.5;
    })();
    if (f >= 0.0) {
      for (let k = 0; k < clustersPerY; k++) {
        const d0 = scaleWidth * f * (treeRand.nextFloat() + 0.328);
        const d1 = treeRand.nextFloat() * 2.0 * Math.PI;
        const d2 = d0 * Math.sin(d1) + 0.5;
        const d3 = d0 * Math.cos(d1) + 0.5;
        const bx = Math.floor(x + d2);
        const by = y + relY - 1;
        const bz = Math.floor(z + d3);
        const topY = by + leafDistanceLimit;
        if (checkBlockLine(bx, by, bz, bx, topY, bz) === -1) {
          const dist = Math.hypot(x - bx, z - bz);
          const d4 = dist * branchSlope;
          const branchBaseY = by - d4 > trunkTopY ? trunkTopY : Math.trunc(by - d4);
          if (checkBlockLine(x, branchBaseY, z, bx, by, bz) === -1) {
            foliageCoords.push([bx, by, bz, branchBaseY]);
          }
        }
      }
    }
    relY--;
  }

  for (let c = 0; c < foliageCoords.length; c++) {
    const [fx, fy, fz] = foliageCoords[c];
    for (let dy = 0; dy < leafDistanceLimit; dy++) {
      const radius = dy > 0 && dy < leafDistanceLimit - 1 ? 3.0 : 2.0;
      const rInt = Math.trunc(radius + 0.618);
      for (let dx = -rInt; dx <= rInt; dx++) {
        for (let dz = -rInt; dz <= rInt; dz++) {
          const d = Math.pow(Math.abs(dx) + 0.5, 2) + Math.pow(Math.abs(dz) + 0.5, 2);
          if (d <= radius * radius) {
            const curId = world.get(fx + dx, fy + dy, fz + dz) >> 4;
            if (curId === 0 || isLeafId(curId)) {
              setBlockWithLeafBreak(world, fx + dx, fy + dy, fz + dz, LEAVES_OAK);
            }
          }
        }
      }
    }
  }

  const limb = (x1, y1, z1, x2, y2, z2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    let maxAbs = Math.abs(dx);
    if (Math.abs(dy) > maxAbs) maxAbs = Math.abs(dy);
    if (Math.abs(dz) > maxAbs) maxAbs = Math.abs(dz);
    const sx = dx / maxAbs;
    const sy = dy / maxAbs;
    const sz = dz / maxAbs;
    for (let i = 0; i <= maxAbs; i++) {
      const bx = Math.floor(0.5 + x1 + i * sx);
      const by = Math.floor(0.5 + y1 + i * sy);
      const bz = Math.floor(0.5 + z1 + i * sz);
      const ax = Math.abs(bx - x1);
      const az = Math.abs(bz - z1);
      const m = Math.max(ax, az);
      let axisMeta = 0;
      if (m > 0) {
        if (ax === m) axisMeta = 4;
        else if (az === m) axisMeta = 8;
      }
      setBlockWithLeafBreak(world, bx, by, bz, LOG_OAK | axisMeta);
    }
  };

  limb(x, y, z, x, trunkTopY, z);
  if (trunkSize === 2) {
    limb(x + 1, y, z, x + 1, trunkTopY, z);
    limb(x + 1, y, z + 1, x + 1, trunkTopY, z + 1);
    limb(x, y, z + 1, x, trunkTopY, z + 1);
  }

  const baseLimit = heightLimit * 0.2;
  for (let c = 0; c < foliageCoords.length; c++) {
    const [fx, fy, fz, branchBaseY] = foliageCoords[c];
    if (branchBaseY - y >= baseLimit) {
      limb(x, branchBaseY, z, fx, fy, fz);
    }
  }

  return true;
}

/**
 * 3. WorldGenForest (birch / super birch)
 */
export function generateBirchTree189(world, rand, x, y, z, useExtraRandomHeight = false) {
  let height = rand.nextInt(3) + 5;
  if (useExtraRandomHeight) height += rand.nextInt(7);
  if (y < 1 || y + height + 1 > 256) return false;

  for (let cy = y; cy <= y + 1 + height; cy++) {
    let radius = 1;
    if (cy === y) radius = 0;
    if (cy >= y + 1 + height - 2) radius = 2;
    for (let cx = x - radius; cx <= x + radius; cx++) {
      for (let cz = z - radius; cz <= z + radius; cz++) {
        if (cy < 0 || cy >= 256 || !canGrowInto(world.get(cx, cy, cz) >> 4)) return false;
      }
    }
  }

  const belowId = world.get(x, y - 1, z) >> 4;
  if (!isSoil(belowId) || y >= 256 - height - 1) return false;
  setDirtAt(world, x, y - 1, z);

  for (let cy = y - 3 + height; cy <= y + height; cy++) {
    const dy = cy - (y + height);
    const radius = Math.floor(1 - dy / 2);
    for (let cx = x - radius; cx <= x + radius; cx++) {
      const dx = cx - x;
      for (let cz = z - radius; cz <= z + radius; cz++) {
        const dz = cz - z;
        if (
          Math.abs(dx) !== radius ||
          Math.abs(dz) !== radius ||
          (rand.nextInt(2) !== 0 && dy !== 0)
        ) {
          if (canReplaceForLeaf(world, cx, cy, cz)) {
            setBlockWithLeafBreak(world, cx, cy, cz, LEAVES_BIRCH);
          }
        }
      }
    }
  }

  for (let i = 0; i < height; i++) {
    if (canReplaceForLeaf(world, x, y + i, z)) {
      setBlockWithLeafBreak(world, x, y + i, z, LOG_BIRCH);
    }
  }

  return true;
}

/**
 * 4. WorldGenTaiga1 (Pine spruce)
 */
export function generateTaiga1Tree189(world, rand, x, y, z) {
  const height = rand.nextInt(5) + 7;
  const trunkTopOffset = height - rand.nextInt(2) - 3;
  const canopyHeight = height - trunkTopOffset;
  const maxRadius = 1 + rand.nextInt(canopyHeight + 1);
  if (y < 1 || y + height + 1 > 256) return false;

  for (let cy = y; cy <= y + 1 + height; cy++) {
    const radius = cy - y < trunkTopOffset ? 0 : maxRadius;
    for (let cx = x - radius; cx <= x + radius; cx++) {
      for (let cz = z - radius; cz <= z + radius; cz++) {
        if (cy < 0 || cy >= 256 || !canGrowInto(world.get(cx, cy, cz) >> 4)) return false;
      }
    }
  }

  const belowId = world.get(x, y - 1, z) >> 4;
  if (!isSoil(belowId) || y >= 256 - height - 1) return false;
  setDirtAt(world, x, y - 1, z);

  let radius = 0;
  for (let cy = y + height; cy >= y + trunkTopOffset; cy--) {
    for (let cx = x - radius; cx <= x + radius; cx++) {
      const dx = cx - x;
      for (let cz = z - radius; cz <= z + radius; cz++) {
        const dz = cz - z;
        if ((Math.abs(dx) !== radius || Math.abs(dz) !== radius || radius <= 0) && isNonFullBlock(world, cx, cy, cz)) {
          setBlockWithLeafBreak(world, cx, cy, cz, LEAVES_SPRUCE);
        }
      }
    }
    if (radius >= 1 && cy === y + trunkTopOffset + 1) radius--;
    else if (radius < maxRadius) radius++;
  }

  for (let i = 0; i < height - 1; i++) {
    if (canReplaceForLeaf(world, x, y + i, z)) {
      setBlockWithLeafBreak(world, x, y + i, z, LOG_SPRUCE);
    }
  }

  return true;
}

/**
 * 5. WorldGenTaiga2 (Spruce)
 */
export function generateTaiga2Tree189(world, rand, x, y, z) {
  const height = rand.nextInt(4) + 6;
  const stemHeight = 1 + rand.nextInt(2);
  const canopyHeight = height - stemHeight;
  const maxRadius = 2 + rand.nextInt(2);
  if (y < 1 || y + height + 1 > 256) return false;

  for (let cy = y; cy <= y + 1 + height; cy++) {
    const radius = cy - y < stemHeight ? 0 : maxRadius;
    for (let cx = x - radius; cx <= x + radius; cx++) {
      for (let cz = z - radius; cz <= z + radius; cz++) {
        if (cy < 0 || cy >= 256 || !isAirOrLeaves(world.get(cx, cy, cz) >> 4)) return false;
      }
    }
  }

  const belowId = world.get(x, y - 1, z) >> 4;
  if (!isSoil(belowId) || y >= 256 - height - 1) return false;
  setDirtAt(world, x, y - 1, z);

  let radius = rand.nextInt(2);
  let stepLimit = 1;
  let resetRadius = 0;
  for (let layer = 0; layer <= canopyHeight; layer++) {
    const cy = y + height - layer;
    for (let cx = x - radius; cx <= x + radius; cx++) {
      const dx = cx - x;
      for (let cz = z - radius; cz <= z + radius; cz++) {
        const dz = cz - z;
        if (Math.abs(dx) !== radius || Math.abs(dz) !== radius || radius <= 0) {
          if (isNonFullBlock(world, cx, cy, cz)) {
            setBlockWithLeafBreak(world, cx, cy, cz, LEAVES_SPRUCE);
          }
        }
      }
    }
    if (radius >= stepLimit) {
      radius = resetRadius;
      resetRadius = 1;
      stepLimit++;
      if (stepLimit > maxRadius) stepLimit = maxRadius;
    } else {
      radius++;
    }
  }

  const topTrim = rand.nextInt(3);
  for (let i = 0; i < height - topTrim; i++) {
    if (canReplaceForLeaf(world, x, y + i, z)) {
      setBlockWithLeafBreak(world, x, y + i, z, LOG_SPRUCE);
    }
  }

  return true;
}

function getHugeTreeHeight(rand, baseHeight, extraRandomHeight) {
  let height = rand.nextInt(3) + baseHeight;
  if (extraRandomHeight > 1) height += rand.nextInt(extraRandomHeight);
  return height;
}

function growLeavesLayerStrict(world, x, y, z, width, leafState) {
  const wSq = width * width;
  for (let dx = -width; dx <= width + 1; dx++) {
    for (let dz = -width; dz <= width + 1; dz++) {
      const ox = dx - 1;
      const oz = dz - 1;
      if (
        dx * dx + dz * dz <= wSq ||
        ox * ox + oz * oz <= wSq ||
        dx * dx + oz * oz <= wSq ||
        ox * ox + dz * dz <= wSq
      ) {
        if (canReplaceForLeaf(world, x + dx, y, z + dz)) {
          setBlockWithLeafBreak(world, x + dx, y, z + dz, leafState);
        }
      }
    }
  }
}

function growLeavesLayer(world, x, y, z, width, leafState) {
  const wSq = width * width;
  for (let dx = -width; dx <= width; dx++) {
    for (let dz = -width; dz <= width; dz++) {
      if (dx * dx + dz * dz <= wSq) {
        if (canReplaceForLeaf(world, x + dx, y, z + dz)) {
          setBlockWithLeafBreak(world, x + dx, y, z + dz, leafState);
        }
      }
    }
  }
}

/**
 * 6. WorldGenMegaJungle (2x2 jungle giant)
 */
export function generateMegaJungleTree189(
  world,
  rand,
  x,
  y,
  z,
  baseHeight = 10,
  extraRandomHeight = 20,
  logState = LOG_JUNGLE,
  leafState = LEAVES_JUNGLE
) {
  const height = getHugeTreeHeight(rand, baseHeight, extraRandomHeight);
  if (!isSpaceClear2x2(world, x, y, z, height) || !ensure2x2Soil(world, x, y, z)) return false;

  for (let cy = y + height - 2; cy <= y + height; cy++) {
    const r = 3 + (y + height - cy);
    growLeavesLayerStrict(world, x, cy, z, r, leafState);
  }

  let by = y + height - 2 - rand.nextInt(4);
  while (by > y + height / 2) {
    const angle = rand.nextFloat() * Math.PI * 2.0;
    let bx = x + Math.trunc(0.5 + Math.cos(angle) * 4.0);
    let bz = z + Math.trunc(0.5 + Math.sin(angle) * 4.0);
    for (let i = 0; i < 5; i++) {
      bx = x + Math.trunc(1.5 + Math.cos(angle) * i);
      bz = z + Math.trunc(1.5 + Math.sin(angle) * i);
      setBlockWithLeafBreak(world, bx, by - 3 + Math.trunc(i / 2), bz, logState);
    }
    const maxDy = 1 + rand.nextInt(2);
    for (let cy = by - maxDy; cy <= by; cy++) {
      const k = cy - by;
      growLeavesLayer(world, bx, cy, bz, 1 - k, leafState);
    }
    by -= 2 + rand.nextInt(4);
  }

  const tryVine = (vx, vy, vz, vineState) => {
    if (rand.nextInt(3) > 0 && (world.get(vx, vy, vz) >> 4) === 0) {
      setBlockWithLeafBreak(world, vx, vy, vz, vineState);
    }
  };

  for (let i = 0; i < height; i++) {
    const cy = y + i;
    if (canGrowInto(world.get(x, cy, z) >> 4)) {
      setBlockWithLeafBreak(world, x, cy, z, logState);
      if (i > 0) {
        tryVine(x - 1, cy, z, VINE_EAST);
        tryVine(x, cy, z - 1, VINE_SOUTH);
      }
    }
    if (i < height - 1) {
      if (canGrowInto(world.get(x + 1, cy, z) >> 4)) {
        setBlockWithLeafBreak(world, x + 1, cy, z, logState);
        if (i > 0) {
          tryVine(x + 2, cy, z, VINE_WEST);
          tryVine(x + 1, cy, z - 1, VINE_SOUTH);
        }
      }
      if (canGrowInto(world.get(x + 1, cy, z + 1) >> 4)) {
        setBlockWithLeafBreak(world, x + 1, cy, z + 1, logState);
        if (i > 0) {
          tryVine(x + 2, cy, z + 1, VINE_WEST);
          tryVine(x + 1, cy, z + 2, VINE_NORTH);
        }
      }
      if (canGrowInto(world.get(x, cy, z + 1) >> 4)) {
        setBlockWithLeafBreak(world, x, cy, z + 1, logState);
        if (i > 0) {
          tryVine(x - 1, cy, z + 1, VINE_EAST);
          tryVine(x, cy, z + 2, VINE_NORTH);
        }
      }
    }
  }

  return true;
}

/**
 * 7. WorldGenMegaPineTree (2x2 giant pine/spruce + podzol generator)
 */
export function generateMegaPineTree189(world, rand, x, y, z, useBaseHeight = false) {
  const height = getHugeTreeHeight(rand, 13, 15);
  if (!isSpaceClear2x2(world, x, y, z, height) || !ensure2x2Soil(world, x, y, z)) return false;

  const crownTop = y + height;
  const radius = rand.nextInt(5) + (useBaseHeight ? 13 : 3);
  let prevLayerRadius = 0;
  for (let cy = crownTop - radius; cy <= crownTop; cy++) {
    const dy = crownTop - cy;
    const width = Math.floor((dy / radius) * 3.5);
    growLeavesLayerStrict(world, x, cy, z, width + (dy > 0 && width === prevLayerRadius && (cy & 1) === 0 ? 1 : 0), LEAVES_SPRUCE);
    prevLayerRadius = width;
  }

  for (let i = 0; i < height; i++) {
    const cy = y + i;
    if (canReplaceForLeaf(world, x, cy, z)) setBlockWithLeafBreak(world, x, cy, z, LOG_SPRUCE);
    if (i < height - 1) {
      if (canReplaceForLeaf(world, x + 1, cy, z)) setBlockWithLeafBreak(world, x + 1, cy, z, LOG_SPRUCE);
      if (canReplaceForLeaf(world, x + 1, cy, z + 1)) setBlockWithLeafBreak(world, x + 1, cy, z + 1, LOG_SPRUCE);
      if (canReplaceForLeaf(world, x, cy, z + 1)) setBlockWithLeafBreak(world, x, cy, z + 1, LOG_SPRUCE);
    }
  }

  return true;
}

function placePodzolAt(world, x, y, z) {
  for (let i = 2; i >= -3; i--) {
    const id = world.get(x, y + i, z) >> 4;
    if (id === 2 || id === 3) {
      setBlockWithLeafBreak(world, x, y + i, z, PODZOL);
      break;
    }
    if (id !== 0 && i < 0) break;
  }
}

function placePodzolCircle(world, x, y, z) {
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
      placePodzolAt(world, x + dx, y, z + dz);
    }
  }
}

// WorldGenMegaPineTree.func_180711_a (podzol circles)
export function generateMegaPinePodzol189(world, rand, x, y, z) {
  placePodzolCircle(world, x - 1, y, z - 1);
  placePodzolCircle(world, x + 2, y, z - 1);
  placePodzolCircle(world, x - 1, y, z + 2);
  placePodzolCircle(world, x + 2, y, z + 2);
  for (let i = 0; i < 5; i++) {
    const j = rand.nextInt(64);
    const k = j % 8;
    const l = Math.trunc(j / 8);
    if (k === 0 || k === 7 || l === 0 || l === 7) {
      placePodzolCircle(world, x - 3 + k, y, z - 3 + l);
    }
  }
}

/**
 * 8. WorldGenSavannaTree (Acacia)
 */
export function generateSavannaTree189(world, rand, x, y, z) {
  const height = rand.nextInt(3) + rand.nextInt(3) + 5;
  if (y < 1 || y + height + 1 > 256) return false;

  for (let cy = y; cy <= y + 1 + height; cy++) {
    let radius = 1;
    if (cy === y) radius = 0;
    if (cy >= y + 1 + height - 2) radius = 2;
    for (let cx = x - radius; cx <= x + radius; cx++) {
      for (let cz = z - radius; cz <= z + radius; cz++) {
        if (cy < 0 || cy >= 256 || !canGrowInto(world.get(cx, cy, cz) >> 4)) return false;
      }
    }
  }

  const belowId = world.get(x, y - 1, z) >> 4;
  if (!isGrassOrDirt(belowId) || y >= 256 - height - 1) return false;
  setDirtAt(world, x, y - 1, z);

  const mainDir = HORIZ_FACINGS[rand.nextInt(4)];
  const bendStart = height - rand.nextInt(4) - 1;
  let leanRemain = 3 - rand.nextInt(3);
  let curX = x;
  let curZ = z;
  let canopyY = 0;

  for (let i = 0; i < height; i++) {
    const cy = y + i;
    if (i >= bendStart && leanRemain > 0) {
      curX += mainDir.dx;
      curZ += mainDir.dz;
      leanRemain--;
    }
    if (canReplaceForLeaf(world, curX, cy, curZ)) {
      setBlockWithLeafBreak(world, curX, cy, curZ, LOG_ACACIA);
      canopyY = cy;
    }
  }

  const placeAcaciaLeaf = (lx, ly, lz) => {
    if (canReplaceForLeaf(world, lx, ly, lz)) {
      setBlockWithLeafBreak(world, lx, ly, lz, LEAVES_ACACIA);
    }
  };

  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      if (Math.abs(dx) < 3 || Math.abs(dz) < 3) placeAcaciaLeaf(curX + dx, canopyY, curZ + dz);
    }
  }
  const topY = canopyY + 1;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) placeAcaciaLeaf(curX + dx, topY, curZ + dz);
  }
  placeAcaciaLeaf(curX - 2, topY, curZ);
  placeAcaciaLeaf(curX + 2, topY, curZ);
  placeAcaciaLeaf(curX, topY, curZ - 2);
  placeAcaciaLeaf(curX, topY, curZ + 2);

  const secDir = HORIZ_FACINGS[rand.nextInt(4)];
  if (secDir !== mainDir) {
    const startIdx = bendStart - rand.nextInt(2) - 1;
    let secRemain = 1 + rand.nextInt(3);
    let sx = x;
    let sz = z;
    let secCanopyY = 0;
    for (let i = startIdx; i < height && secRemain > 0; i++, secRemain--) {
      if (i >= 1) {
        const cy = y + i;
        sx += secDir.dx;
        sz += secDir.dz;
        if (canReplaceForLeaf(world, sx, cy, sz)) {
          setBlockWithLeafBreak(world, sx, cy, sz, LOG_ACACIA);
          secCanopyY = cy;
        }
      }
    }
    if (secCanopyY > 0) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) < 2 || Math.abs(dz) < 2) placeAcaciaLeaf(sx + dx, secCanopyY, sz + dz);
        }
      }
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) placeAcaciaLeaf(sx + dx, secCanopyY + 1, sz + dz);
      }
    }
  }

  return true;
}

/**
 * 9. WorldGenCanopyTree (Dark Oak)
 */
export function generateCanopyTree189(world, rand, x, y, z) {
  const height = rand.nextInt(3) + rand.nextInt(2) + 6;
  if (y < 1 || y + height + 1 > 256) return false;

  for (let dy = 0; dy <= height + 1; dy++) {
    const cy = y + dy;
    const radius = cy - y < 2 ? 0 : 2;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (cy < 0 || cy >= 256 || !canGrowInto(world.get(x + dx, cy, z + dz) >> 4)) return false;
      }
    }
  }

  if (!isGrassOrDirt(world.get(x, y - 1, z) >> 4)) return false;
  setDirtAt(world, x, y - 1, z);
  setDirtAt(world, x + 1, y - 1, z);
  setDirtAt(world, x + 1, y - 1, z + 1);
  setDirtAt(world, x, y - 1, z + 1);

  const dir = HORIZ_FACINGS[rand.nextInt(4)];
  const bendStart = height - rand.nextInt(4);
  let leanRemain = 2 - rand.nextInt(3);
  let curX = x;
  let curZ = z;
  const topY = y + height - 1;

  for (let i = 0; i < height; i++) {
    if (i >= bendStart && leanRemain > 0) {
      curX += dir.dx;
      curZ += dir.dz;
      leanRemain--;
    }
    const cy = y + i;
    if (canReplaceForLeaf(world, curX, cy, curZ)) {
      setBlockWithLeafBreak(world, curX, cy, curZ, LOG_DARK_OAK);
      setBlockWithLeafBreak(world, curX + 1, cy, curZ, LOG_DARK_OAK);
      setBlockWithLeafBreak(world, curX, cy, curZ + 1, LOG_DARK_OAK);
      setBlockWithLeafBreak(world, curX + 1, cy, curZ + 1, LOG_DARK_OAK);
    }
  }

  const placeLeaf = (lx, ly, lz) => {
    if ((world.get(lx, ly, lz) >> 4) === 0) {
      setBlockWithLeafBreak(world, lx, ly, lz, LEAVES_DARK_OAK);
    }
  };
  const placeLog = (lx, ly, lz) => {
    if (canGrowInto(world.get(lx, ly, lz) >> 4)) {
      setBlockWithLeafBreak(world, lx, ly, lz, LOG_DARK_OAK);
    }
  };

  for (let dx = -2; dx <= 0; dx++) {
    for (let dz = -2; dz <= 0; dz++) {
      let ly = -1;
      placeLeaf(curX + dx, topY + ly, curZ + dz);
      placeLeaf(1 + curX - dx, topY + ly, curZ + dz);
      placeLeaf(curX + dx, topY + ly, 1 + curZ - dz);
      placeLeaf(1 + curX - dx, topY + ly, 1 + curZ - dz);
      if ((dx > -2 || dz > -1) && (dx !== -1 || dz !== -2)) {
        ly = 1;
        placeLeaf(curX + dx, topY + ly, curZ + dz);
        placeLeaf(1 + curX - dx, topY + ly, curZ + dz);
        placeLeaf(curX + dx, topY + ly, 1 + curZ - dz);
        placeLeaf(1 + curX - dx, topY + ly, 1 + curZ - dz);
      }
    }
  }

  if (rand.nextBoolean()) {
    placeLeaf(curX, topY + 2, curZ);
    placeLeaf(curX + 1, topY + 2, curZ);
    placeLeaf(curX + 1, topY + 2, curZ + 1);
    placeLeaf(curX, topY + 2, curZ + 1);
  }

  for (let dx = -3; dx <= 4; dx++) {
    for (let dz = -3; dz <= 4; dz++) {
      if (
        (dx !== -3 || dz !== -3) &&
        (dx !== -3 || dz !== 4) &&
        (dx !== 4 || dz !== -3) &&
        (dx !== 4 || dz !== 4) &&
        (Math.abs(dx) < 3 || Math.abs(dz) < 3)
      ) {
        placeLeaf(curX + dx, topY, curZ + dz);
      }
    }
  }

  for (let bx = -1; bx <= 2; bx++) {
    for (let bz = -1; bz <= 2; bz++) {
      if ((bx < 0 || bx > 1 || bz < 0 || bz > 1) && rand.nextInt(3) <= 0) {
        const bLen = rand.nextInt(3) + 2;
        for (let i = 0; i < bLen; i++) {
          placeLog(x + bx, topY - i - 1, z + bz);
        }
        for (let lx = -1; lx <= 1; lx++) {
          for (let lz = -1; lz <= 1; lz++) {
            placeLeaf(curX + bx + lx, topY, curZ + bz + lz);
          }
        }
        for (let lx = -2; lx <= 2; lx++) {
          for (let lz = -2; lz <= 2; lz++) {
            if (Math.abs(lx) !== 2 || Math.abs(lz) !== 2) {
              placeLeaf(curX + bx + lx, topY - 1, curZ + bz + lz);
            }
          }
        }
      }
    }
  }

  return true;
}

/**
 * 10. WorldGenSwamp
 */
export function generateSwampTree189(world, rand, x, y, z) {
  const height = rand.nextInt(4) + 5;
  while ((world.get(x, y - 1, z) >> 4) === 9 || (world.get(x, y - 1, z) >> 4) === 8) {
    y--;
  }
  if (y < 1 || y + height + 1 > 256) return false;

  for (let cy = y; cy <= y + 1 + height; cy++) {
    let radius = 1;
    if (cy === y) radius = 0;
    if (cy >= y + 1 + height - 2) radius = 3;
    for (let cx = x - radius; cx <= x + radius; cx++) {
      for (let cz = z - radius; cz <= z + radius; cz++) {
        if (cy < 0 || cy >= 256) return false;
        const id = world.get(cx, cy, cz) >> 4;
        if (!isAirOrLeaves(id)) {
          if ((id !== 9 && id !== 8) || cy > y) return false;
        }
      }
    }
  }

  if (!isGrassOrDirt(world.get(x, y - 1, z) >> 4) || y >= 256 - height - 1) return false;
  setDirtAt(world, x, y - 1, z);

  for (let cy = y - 3 + height; cy <= y + height; cy++) {
    const dy = cy - (y + height);
    const radius = Math.floor(2 - dy / 2);
    for (let cx = x - radius; cx <= x + radius; cx++) {
      const dx = cx - x;
      for (let cz = z - radius; cz <= z + radius; cz++) {
        const dz = cz - z;
        if (Math.abs(dx) !== radius || Math.abs(dz) !== radius || (rand.nextInt(2) !== 0 && dy !== 0)) {
          if (canReplaceForLeaf(world, cx, cy, cz)) {
            setBlockWithLeafBreak(world, cx, cy, cz, LEAVES_OAK);
          }
        }
      }
    }
  }

  for (let i = 0; i < height; i++) {
    const id = world.get(x, y + i, z) >> 4;
    if (id === 0 || isLeafId(id) || id === 8 || id === 9) {
      setBlockWithLeafBreak(world, x, y + i, z, LOG_OAK);
    }
  }

  for (let cy = y - 3 + height; cy <= y + height; cy++) {
    const dy = cy - (y + height);
    const radius = Math.floor(2 - dy / 2);
    for (let cx = x - radius; cx <= x + radius; cx++) {
      for (let cz = z - radius; cz <= z + radius; cz++) {
        if (isLeafId(world.get(cx, cy, cz) >> 4)) {
          if (rand.nextInt(4) === 0 && (world.get(cx - 1, cy, cz) >> 4) === 0) addHangingVine(world, cx - 1, cy, cz, VINE_EAST);
          if (rand.nextInt(4) === 0 && (world.get(cx + 1, cy, cz) >> 4) === 0) addHangingVine(world, cx + 1, cy, cz, VINE_WEST);
          if (rand.nextInt(4) === 0 && (world.get(cx, cy, cz - 1) >> 4) === 0) addHangingVine(world, cx, cy, cz - 1, VINE_SOUTH);
          if (rand.nextInt(4) === 0 && (world.get(cx, cy, cz + 1) >> 4) === 0) addHangingVine(world, cx, cy, cz + 1, VINE_NORTH);
        }
      }
    }
  }

  return true;
}

/**
 * 11. WorldGenShrub (Jungle bush)
 */
export function generateShrub189(
  world,
  rand,
  x,
  y,
  z,
  logState = LOG_JUNGLE,
  leafState = LEAVES_OAK_DEFAULT,
  isFullCube = world.isFullCube??(state=>state!==0)
) {
  let cy = y;
  while (cy > 0) {
    const id = world.get(x, cy, z) >> 4;
    if (id !== 0 && !isLeafId(id)) break;
    cy--;
  }
  const groundId = world.get(x, cy, z) >> 4;
  if (isGrassOrDirt(groundId)) {
    cy++;
    setBlockWithLeafBreak(world, x, cy, z, logState);
    for (let ly = cy; ly <= cy + 2; ly++) {
      const dy = ly - cy;
      const radius = 2 - dy;
      for (let lx = x - radius; lx <= x + radius; lx++) {
        const dx = lx - x;
        for (let lz = z - radius; lz <= z + radius; lz++) {
          const dz = lz - z;
          if (
            (Math.abs(dx) !== radius || Math.abs(dz) !== radius || rand.nextInt(2) !== 0) &&
            !isFullCube(world.get(lx, ly, lz))
          ) {
            setBlockWithLeafBreak(world, lx, ly, lz, leafState);
          }
        }
      }
    }
  }
  return true;
}
