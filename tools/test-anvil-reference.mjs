import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { test } from 'node:test';
import { Writer } from '../client/js/net/buffer.js';
import { nbt, writeNbtRoot } from '../client/js/net/nbt.js';
import { compareColumns, readAnvilColumn } from './anvil-reference.mjs';

test('Anvil data comparison reads negative coordinates, section metadata and population flags', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'anvil-comparison-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const blocks = new Int8Array(4096);
  blocks[0] = 7;
  blocks[1] = 35;
  const data = new Int8Array(2048);
  data[0] = 11 << 4;
  const compound = nbt.compound({
    Level: nbt.compound({
      xPos: nbt.int(-1), zPos: nbt.int(0), TerrainPopulated: nbt.byte(1),
      Biomes: { t: 7, v: new Int8Array(256).fill(1) },
      HeightMap: { t: 11, v: new Int32Array(256) },
      Sections: nbt.list(10, [{
        Y: nbt.byte(0), Blocks: { t: 7, v: blocks }, Data: { t: 7, v: data },
      }]),
    }),
  });
  const writer = new Writer();
  writeNbtRoot(writer, { ...compound, name: '' });
  const compressed = deflateSync(writer.build());
  const sectors = Math.ceil((compressed.length + 5) / 4096);
  const region = Buffer.alloc(8192 + sectors * 4096);
  region.writeUInt32BE((2 << 8) | sectors, 31 * 4);
  region.writeUInt32BE(compressed.length + 1, 8192);
  region[8196] = 2;
  compressed.copy(region, 8197);
  const path = join(folder, 'r.-1.0.mca');
  await writeFile(path, region);
  const reference = await readAnvilColumn(path, -1, 0);
  assert.equal(reference.states[0], 7 << 4);
  assert.equal(reference.states[1], (35 << 4) | 11);
  const same = compareColumns(reference, reference);
  assert.equal(same.referenceStage, 'populated');
  assert.deepEqual(same.blockStates, { equal: 65536, total: 65536, fraction: 1 });
  assert.equal(same.biomes.fraction, 1);
  assert.equal(same.ores.total, 0);
  const candidate = { states: reference.states.slice(), biomes: reference.biomes.slice() };
  candidate.states[0] = 0;
  candidate.states[5] = 16 << 4;
  candidate.biomes[255] = 2;
  const changed = compareColumns(reference, candidate);
  assert.equal(changed.blockStates.equal, 65534);
  assert.equal(changed.biomes.equal, 255);
  assert.equal(changed.bottomBedrockMask.equal, 1279);
  assert.equal(changed.ores.total, 1);
  assert.equal(changed.ores.equal, 0);
  await assert.rejects(readAnvilColumn(path, 0, 0), /absent/);
  await writeFile(path, Buffer.alloc(2));
  await assert.rejects(readAnvilColumn(path, -1, 0), /truncated/);
});
