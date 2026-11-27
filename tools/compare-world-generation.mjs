import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { readAnvilColumn, compareColumns } from './anvil-reference.mjs';
import { createTerrain } from '../client/js/local-world/terrain.js';
import { newWorldState } from '../client/js/local-world/world-metadata.js';

const [world, seed, xText, zText, output] = process.argv.slice(2);
const x = Number(xText), z = Number(zText);
if (!world || !seed || !xText || !zText || !Number.isInteger(x) || !Number.isInteger(z) ||
    x < -1875000 || x >= 1875000 || z < -1875000 || z >= 1875000) {
  throw new Error('Usage: node tools/compare-world-generation.mjs WORLD_DIRECTORY NONZERO_SEED CHUNK_X CHUNK_Z [REPORT_JSON]');
}
if (!/^-?\d+$/.test(seed) || BigInt(seed) === 0n) throw new Error('Pass the resolved, nonzero numeric seed.');
const path = join(resolve(world), 'region', 'r.' + Math.floor(x / 32) + '.' + Math.floor(z / 32) + '.mca');
const reference = await readAnvilColumn(path, x, z);
const state = newWorldState({ name: 'Comparison', seed, creation: { gameMode: 'creative' } });
const terrain = createTerrain(state);
const start = performance.now();
const column = terrain.column(x, z);
const milliseconds = performance.now() - start;
const report = {
  generator: state.generator, seed: state.seed, x, z,
  ...compareColumns(reference, column), generationMilliseconds: milliseconds,
};
const json = JSON.stringify(report, null, 2) + '\n';
if (output) await writeFile(output, json);
process.stdout.write(json);
