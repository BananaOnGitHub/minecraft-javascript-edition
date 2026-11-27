import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Biomes189, GENERATOR_ID } from '../client/js/local-world/generation/v1_8_9/biomes.js';
import { JavaRandom } from '../client/js/local-world/java-random.js';
import { ImprovedNoise189, SimplexNoise189, PerlinOctaves189, SimplexOctaves189 } from '../client/js/local-world/generation/v1_8_9/noise.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/vanilla-189-biomes.json', import.meta.url)));
const expand = rle => Uint8Array.from(rle.flatMap((v,i) => i%2 === 0 ? Array(rle[i+1]).fill(v) : []));

test('1.8.9 block and quarter-resolution biomes match vanilla, including signed long limits', () => {
  assert.equal(fixture.generator, GENERATOR_ID);
  let count = 0;
  for (const f of fixture.cases) {
    const expected = expand(f.rle);
    assert.equal(expected.length, f.width*f.height);
    assert.deepEqual(new Biomes189(f.seed).sample(f.x,f.z,f.width,f.height,{scale:f.scale}),
      expected, `seed=${f.seed}, scale=${f.scale}, origin=${f.x},${f.z}`);
    count += expected.length;
  }
  assert.equal(count, 65536);
});

test('biome queries are independent of request order and rectangle boundaries', () => {
  for (const scale of [1,4]) {
    const g = new Biomes189('-9223372036854775808');
    const whole = g.sample(-17,-17,34,34,{scale});
    for (const [x,z] of [[0,0],[-17,-17],[0,-17],[-17,0]].reverse()) {
      const part = g.sample(x,z,17,17,{scale});
      for(let j=0;j<17;j++) assert.deepEqual(part.subarray(j*17,(j+1)*17),
        whole.subarray((z+17+j)*34+x+17,(z+17+j)*34+x+34));
    }
    assert.deepEqual(g.sample(-17,-17,34,34,{scale}),whole);
    assert.ok(g.layers.every(l => l.cache.size === 0), 'query caches must be released');
  }
});

test('biome stage rejects lossy seed input and invalid query dimensions', () => {
  assert.throws(() => new Biomes189(7), /exact/);
  const g = new Biomes189(7n);
  assert.throws(() => g.sample(0.5,0,16,16), /Integer/);
  assert.throws(() => g.sample(0,0,0,16), /size/);
  assert.throws(() => g.sample(0,0,16,16,{scale:2}), /scale/);
});

test('legacy 2D/3D noise and octaves match native double outputs exactly', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/vanilla-189-noise.json', import.meta.url)));
  let count=0;
  for (const f of fixture.cases) {
    const random = new JavaRandom(BigInt(f.seed));
    let actual = new Float64Array(f.values.length);
    switch(f.kind) {
      case 'perlin': new ImprovedNoise189(random).add(actual,f.x,f.y,f.z,f.nx,f.ny,f.nz,f.sx,f.sy,f.sz,f.amplitude); break;
      case 'simplex': new SimplexNoise189(random).add(actual,f.x,f.z,f.nx,f.nz,f.sx,f.sz,f.amplitude); break;
      case 'perlin-octaves': actual=new PerlinOctaves189(random,4).sample(f.x,f.y,f.z,f.nx,f.ny,f.nz,f.sx,f.sy,f.sz); break;
      case 'simplex-octaves': actual=new SimplexOctaves189(random,4).sample(f.x,f.z,f.nx,f.nz,f.sx,f.sz,0.5,0.5); break;
      default: assert.fail('Unknown native noise fixture kind');
    }
    assert.deepEqual(actual, Float64Array.from(f.values), `${f.kind}, seed=${f.seed}`);
    count += actual.length;
  }
  assert.equal(count,5880);
});
