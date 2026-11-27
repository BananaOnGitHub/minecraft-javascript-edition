import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { DefaultTerrain189, BIOME_HEIGHTS } from '../client/js/local-world/generation/v1_8_9/default.js';
import { replaceSurfaces189 } from '../client/js/local-world/generation/v1_8_9/surface.js';
import { carveCaves189, carveRavines189 } from '../client/js/local-world/generation/v1_8_9/carvers.js';
import { generateStandardOres189, generateExtremeHillsOres189 } from '../client/js/local-world/generation/v1_8_9/ores.js';
import {
  generateOakTree189,
  generateBigOakTree189,
  BigOakTree189,
  generateBirchTree189,
  generateTaiga1Tree189,
  generateTaiga2Tree189,
  generateMegaJungleTree189,
  generateMegaPineTree189,
  generateMegaPinePodzol189,
  generateSavannaTree189,
  generateCanopyTree189,
  generateSwampTree189,
  generateShrub189,
} from '../client/js/local-world/generation/v1_8_9/trees.js';
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
  assert.throws(() => new Biomes189(9223372036854775808n), /signed 64/);
  assert.throws(() => new Biomes189('0x10'), /decimal/);
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

const terrainFixtures = await Promise.all(['7','-7','9223372036854775807','-9223372036854775808'].map(async seed =>
  JSON.parse(gunzipSync(await readFile(new URL(`./fixtures/vanilla-189-terrain-${seed}.json.gz`,import.meta.url))))));
const diverseTerrain = JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-diverse-terrain.json.gz',import.meta.url))));
const statesFromRuns = runs => Uint16Array.from(runs.flatMap((v,i) => i%2===0 ? Array(runs[i+1]).fill(v) : []));

test('Default density and interpolated stone/water/air match native stages exactly', () => {
  let samples=0,states=0;
  for(const fixture of terrainFixtures) {
    for(const [id,h,v] of fixture.biomeParameters) assert.deepEqual(BIOME_HEIGHTS.get(id),[Math.fround(h),Math.fround(v)]);
    const generator = new DefaultTerrain189(fixture.seed);
    for(const column of fixture.columns) {
      const actual=generator.rawColumn(column.x,column.z);
      const label=`seed=${fixture.seed}, chunk=${column.x},${column.z}`;
      assert.deepEqual(actual.density,Float64Array.from(column.density),label+' density');
      assert.deepEqual(actual.biomes,expand(column.biomes),label+' biomes');
      assert.deepEqual(actual.states,statesFromRuns(column.raw),label+' raw states');
      samples+=actual.density.length;states+=actual.states.length;
    }
  }
  assert.equal(samples,26400);assert.equal(states,2097152);
});

test('diverse biome density, raw blocks, surface states, heights and bedrock match native', () => {
  for(const fixture of [...terrainFixtures,diverseTerrain]) {
    const generator=new DefaultTerrain189(fixture.seed);
    for(const c of fixture.columns) {
      const a=generator.surfaceColumn(c.x,c.z),expected=statesFromRuns(c.surface);
      const label=`seed=${fixture.seed}, chunk=${c.x},${c.z}`;
      assert.deepEqual(a.density,Float64Array.from(c.density),label+' density');
      assert.deepEqual(a.states,expected,label+' surface');
      for(let i=0;i<256;i++) {
        let top=255;while(top>=0&&a.states[top*256+i]===0)top--;
        let expectedTop=255;while(expectedTop>=0&&expected[expectedTop*256+i]===0)expectedTop--;
        assert.equal(top,expectedTop,label+' height');
        for(let y=0;y<5;y++)assert.equal(a.states[y*256+i]===112,expected[y*256+i]===112,label+' bedrock');
      }
    }
  }
});

test('all 59 Overworld biome surfaces match native diagnostic terrain, including overhangs', async () => {
  const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-biome-surfaces.json.gz',import.meta.url))));
  const generator=new DefaultTerrain189(fixture.seed),raw=statesFromRuns(fixture.raw),ids=new Set();
  for(const c of fixture.cases) {
    const a=replaceSurfaces189(generator,c.x,c.z,{states:raw.slice(),biomes:new Uint8Array(256).fill(c.biome)});
    assert.deepEqual(a.states,statesFromRuns(c.states),`biome=${c.biome}, chunk=${c.x},${c.z}`);
    ids.add(c.biome);
  }
  assert.equal(ids.size,59);assert.equal(fixture.cases.length,177);
});

test('caves and ravines match separate native stages, including lava, water and surface repair', () => {
  let caveChanges=0,ravineChanges=0;
  for(const fixture of [...terrainFixtures,diverseTerrain]) {
    const generator=new DefaultTerrain189(fixture.seed);
    for(const c of fixture.columns) {
      const column=generator.surfaceColumn(c.x,c.z),surface=column.states.slice();
      carveCaves189(generator.seed,c.x,c.z,column);
      const label=`seed=${fixture.seed}, chunk=${c.x},${c.z}`;
      assert.deepEqual(column.states,statesFromRuns(c.caves),label+' caves');
      const caves=column.states.slice();
      caveChanges+=caves.reduce((sum,v,i)=>sum+(v!==surface[i]),0);
      carveRavines189(generator.seed,c.x,c.z,column);
      assert.deepEqual(column.states,statesFromRuns(c.ravines),label+' ravines');
      ravineChanges+=column.states.reduce((sum,v,i)=>sum+(v!==caves[i]),0);
    }
  }
  assert.ok(caveChanges>10000);assert.ok(ravineChanges>1000);
});

test('carved terrain is independent of chunk request order', () => {
  const generator=new DefaultTerrain189('7');
  const before=generator.carvedColumn(-229,-236);
  generator.carvedColumn(-2,-177);
  generator.carvedColumn(262,2);
  assert.deepEqual(generator.carvedColumn(-229,-236).states,before.states);
  assert.deepEqual(new DefaultTerrain189('7').carvedColumn(-229,-236).states,before.states);
});

test('1.8.9 standard ore generation matches native BiomeDecorator across seeds and negative coordinates', async () => {
  const fixture = JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-ores.json', import.meta.url).pathname.replace(/\.json$/, '.json.gz'))));
  let totalPlaced = 0;
  for (const c of fixture.cases.filter(entry => entry.kind === 'standard')) {
    const blocks = new Map();
    const world = {
      get: (x, y, z) => blocks.get(`${x},${y},${z}`) ?? 16,
      set: (x, y, z, state) => blocks.set(`${x},${y},${z}`, state),
    };
    generateStandardOres189(world, new JavaRandom(BigInt(c.seed)), c.cx * 16, c.cz * 16);
    const expected = new Map(c.placed.map(([x, y, z, state]) => [`${x},${y},${z}`, state]));
    assert.equal(blocks.size, expected.size, `seed=${c.seed}, chunk=${c.cx},${c.cz} count`);
    for (const [key, state] of expected) {
      assert.equal(blocks.get(key) ?? 16, state, `seed=${c.seed}, pos=${key}`);
    }
    totalPlaced += expected.size;
  }
  assert.equal(totalPlaced, 22146);

  // Verify Extreme Hills emerald (no +8 offset) and silverfish (with +8 offset) replace stone variants.
  const hillBlocks = new Map([['0,4,0', 17]]); // granite at (0,4,0) should still be replaceable by emerald/silverfish
  const hillWorld = {
    get: (x, y, z) => hillBlocks.get(`${x},${y},${z}`) ?? 16,
    set: (x, y, z, state) => hillBlocks.set(`${x},${y},${z}`, state),
  };
  generateExtremeHillsOres189(hillWorld, new JavaRandom(777n), 108 * 16, 108 * 16);
  const emeralds = [...hillBlocks.entries()].filter(([, s]) => s === (129 << 4));
  const eggs = [...hillBlocks.entries()].filter(([, s]) => s === (97 << 4));
  assert.ok(emeralds.length >= 3 && emeralds.length <= 8);
  for (const [k] of emeralds) {
    const [x, y, z] = k.split(',').map(Number);
    assert.ok(x >= 108 * 16 && x < 109 * 16 && z >= 108 * 16 && z < 109 * 16 && y >= 4 && y < 32);
  }
  assert.ok(eggs.length > 0);
});

test('1.8.9 tree generators match native server blocks, metadata, cocoa, vines, and leaf check_decay', async () => {
  const treesFixture = JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-trees.json.gz', import.meta.url))));
  const LOG_JUNGLE = (17 << 4) | 3;
  const LEAVES_JUNGLE = (18 << 4) | 3;
  const LEAVES_OAK_DEFAULT = (18 << 4) | 8;
  // The handoff's native probe reused one large-oak generator for seeds 1, 2,
  // and 7, retaining its height between calls. Other cases use fresh instances.
  const bigOak = new BigOakTree189();

  for (const c of treesFixture.cases) {
    const blocks = new Map();
    const key = (x, y, z) => `${x},${y},${z}`;
    const world = {
      get: (x, y, z) => {
        if (blocks.has(key(x, y, z))) return blocks.get(key(x, y, z));
        if (y < 63) return 16;
        if (y === 63) return 32;
        return 0;
      },
      set: (x, y, z, state) => blocks.set(key(x, y, z), state),
    };
    const rand = new JavaRandom(BigInt(c.seed));
    let ok = false;
    switch (c.kind) {
      case 'oak': ok = generateOakTree189(world, rand, c.ox, c.oy, c.oz); break;
      case 'oak_vines_jungle': ok = generateOakTree189(world, rand, c.ox, c.oy, c.oz, 4, LOG_JUNGLE, LEAVES_JUNGLE, true); break;
      case 'big_oak': ok = bigOak.generate(world, rand, c.ox, c.oy, c.oz); break;
      case 'birch': ok = generateBirchTree189(world, rand, c.ox, c.oy, c.oz, false); break;
      case 'super_birch': ok = generateBirchTree189(world, rand, c.ox, c.oy, c.oz, true); break;
      case 'taiga1': ok = generateTaiga1Tree189(world, rand, c.ox, c.oy, c.oz); break;
      case 'taiga2': ok = generateTaiga2Tree189(world, rand, c.ox, c.oy, c.oz); break;
      case 'mega_jungle': ok = generateMegaJungleTree189(world, rand, c.ox, c.oy, c.oz); break;
      case 'mega_pine':
        ok = generateMegaPineTree189(world, rand, c.ox, c.oy, c.oz, false);
        if (ok) generateMegaPinePodzol189(world, rand, c.ox, c.oy, c.oz);
        break;
      case 'mega_spruce':
        ok = generateMegaPineTree189(world, rand, c.ox, c.oy, c.oz, true);
        if (ok) generateMegaPinePodzol189(world, rand, c.ox, c.oy, c.oz);
        break;
      case 'savanna': ok = generateSavannaTree189(world, rand, c.ox, c.oy, c.oz); break;
      case 'canopy': ok = generateCanopyTree189(world, rand, c.ox, c.oy, c.oz); break;
      case 'swamp': ok = generateSwampTree189(world, rand, c.ox, c.oy, c.oz); break;
      case 'shrub': ok = generateShrub189(world, rand, c.ox, c.oy, c.oz, LOG_JUNGLE, LEAVES_OAK_DEFAULT); break;
      default: throw new Error(`Unknown tree kind ${c.kind}`);
    }
    assert.equal(ok, c.ok, `${c.kind} seed=${c.seed} ok`);
    const actual = [];
    for (let dy = 58; dy < 110; dy++) {
      for (let dz = -16; dz < 16; dz++) {
        for (let dx = -16; dx < 16; dx++) {
          const st = world.get(c.ox + dx, dy, c.oz + dz);
          const exp = dy < 63 ? 16 : (dy === 63 ? 32 : 0);
          if (st !== exp) actual.push([dx, dy - c.oy, dz, st]);
        }
      }
    }
    assert.deepEqual(actual, c.blocks, `${c.kind} seed=${c.seed} blocks mismatch`);
  }
});

test('large oak retains instance height and RNG lifecycle while fresh calls remain independent', async () => {
  const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-big-oak-lifecycle.json.gz',import.meta.url))));
  const previous=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-trees.json.gz',import.meta.url))));
  const shared=new BigOakTree189();
  let cases=0;
  for(const c of fixture.cases) {
    const blocks=new Map(),key=(x,y,z)=>`${x},${y},${z}`;
    const world={
      get:(x,y,z)=>blocks.get(key(x,y,z))??(y<63?16:y===63?32:0),
      set:(x,y,z,state)=>blocks.set(key(x,y,z),state),
    };
    const random=new JavaRandom(BigInt(c.seed));
    const ok=c.lifecycle==='shared'?shared.generate(world,random,c.ox,c.oy,c.oz):
      generateBigOakTree189(world,random,c.ox,c.oy,c.oz);
    const label=`${c.lifecycle}, seed=${c.seed}`;
    assert.equal(ok,c.ok,label+' result');
    assert.equal(random.nextInt(),c.rngAfter,label+' caller RNG');
    if(c.lifecycle==='shared') {
      assert.equal(shared.heightLimit,c.heightLimit,label+' retained height');
      assert.deepEqual(c.blocks,previous.cases.find(p=>p.kind==='big_oak'&&p.seed===c.seed).blocks,
        label+' original handoff fixture remains unchanged');
    }
    const actual=[];
    for(let by=58;by<110;by++)for(let dz=-16;dz<16;dz++)for(let dx=-16;dx<16;dx++) {
      const value=world.get(c.ox+dx,by,c.oz+dz),base=by<63?16:by===63?32:0;
      if(value!==base)actual.push([dx,by-c.oy,dz,value]);
    }
    assert.deepEqual(actual,c.blocks,label+' blocks and metadata');
    cases++;
  }
  assert.equal(cases,6);
  assert.equal(fixture.cases.find(c=>c.lifecycle==='fresh'&&c.seed===7).heightLimit,13);
  assert.equal(fixture.cases.find(c=>c.lifecycle==='shared'&&c.seed===7).heightLimit,14);
});
