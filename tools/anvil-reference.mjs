import { readFile } from 'node:fs/promises';
import { gunzipSync, inflateSync } from 'node:zlib';
import { Reader } from '../client/js/net/buffer.js';
import { readNbtRoot, simplify } from '../client/js/net/nbt.js';

const nibble = (bytes, index) => bytes ? ((bytes[index >> 1] & 255) >> ((index & 1) * 4)) & 15 : 0;

// Read generated data from a user-provisioned Anvil region, without loading
// application classes or requiring a particular generator implementation.
export async function readAnvilColumn(path, x, z) {
  const bytes = await readFile(path);
  if (bytes.length < 8192) throw new Error('Region header is truncated.');
  const entry = ((z & 31) * 32 + (x & 31)) * 4;
  const location = bytes.readUInt32BE(entry);
  const offset = (location >>> 8) * 4096;
  const sectors = location & 255;
  if (!offset || !sectors) throw new Error('The requested chunk is absent from this region.');
  if (offset + 5 > bytes.length) throw new Error('Chunk header is truncated.');
  const size = bytes.readUInt32BE(offset);
  if (size < 1 || size + 4 > sectors * 4096 || offset + 4 + size > bytes.length) throw new Error('Chunk payload is truncated.');
  const payload = bytes.subarray(offset + 5, offset + 4 + size);
  const compression = bytes[offset + 4];
  let nbt;
  if (compression === 1) nbt = gunzipSync(payload);
  else if (compression === 2) nbt = inflateSync(payload);
  else if (compression === 3) nbt = payload;
  else throw new Error('Unsupported Anvil compression type.');
  const root = simplify(readNbtRoot(new Reader(nbt)));
  const level = root.Level;
  if (!level || level.xPos !== x || level.zPos !== z) throw new Error('Region chunk coordinates disagree.');
  if (!level.Biomes || level.Biomes.length !== 256) throw new Error('Chunk biome data is invalid.');
  const states = new Uint16Array(65536);
  for (const section of level.Sections ?? []) {
    const sy = section.Y;
    if (!Number.isInteger(sy) || sy < 0 || sy > 15 ||
        section.Blocks?.length !== 4096 || section.Data?.length !== 2048) {
      throw new Error('Chunk section is invalid.');
    }
    for (let i = 0; i < 4096; i++) {
      const id = (section.Blocks[i] & 255) | (nibble(section.Add, i) << 8);
      states[sy * 4096 + i] = (id << 4) | nibble(section.Data, i);
    }
  }
  return {
    x, z, states, biomes: Uint8Array.from(level.Biomes),
    storedHeightMap: level.HeightMap,
    populated: !!level.TerrainPopulated,
  };
}

function topNonAir(states) {
  const heights = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let y = 255;
    while (y >= 0 && states[y * 256 + i] === 0) y--;
    heights[i] = y + 1;
  }
  return heights;
}

function matches(reference, actual, include = () => true, map = value => value) {
  let equal = 0, total = 0;
  for (let i = 0; i < reference.length; i++) {
    if (!include(reference[i], actual[i], i)) continue;
    total++;
    if (map(reference[i]) === map(actual[i])) equal++;
  }
  return { equal, total, fraction: total ? equal / total : null };
}

export function compareColumns(reference, actual) {
  if (actual.states.length !== 65536 || actual.biomes.length !== 256) throw new Error('Candidate column shape is invalid.');
  const oreIds = new Set([14, 15, 16, 21, 56, 73, 74, 129]);
  const vegetationIds = new Set([6, 17, 18, 31, 32, 37, 38, 39, 40, 81, 83, 106, 111, 161, 162, 175]);
  return {
    referenceStage: reference.populated ? 'populated' : 'base-or-unpopulated',
    biomes: matches(reference.biomes, actual.biomes),
    topNonAir: matches(topNonAir(reference.states), topNonAir(actual.states)),
    blockStates: matches(reference.states, actual.states),
    blockIds: matches(reference.states, actual.states, undefined, state => state >> 4),
    metadata: matches(reference.states, actual.states, undefined, state => state & 15),
    bottomBedrockMask: matches(reference.states, actual.states, (a, b, i) => i < 5 * 256, state => (state >> 4) === 7),
    ores: matches(reference.states, actual.states, (a, b) => oreIds.has(a >> 4) || oreIds.has(b >> 4)),
    vegetation: matches(reference.states, actual.states, (a, b) => vegetationIds.has(a >> 4) || vegetationIds.has(b >> 4)),
    density: 'unavailable in region files',
    structures: 'requires dedicated structure fixtures',
    note: 'topNonAir is calculated from both block arrays. It is distinct from the stored light heightmap.',
  };
}
