import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {GenerationWorld189} from '../client/js/local-world/generation/v1_8_9/generation-world.js';
import {JavaRandom} from '../client/js/local-world/java-random.js';
import {BLOCK_PROPERTIES_189} from '../client/js/local-world/generation/v1_8_9/block-properties.js';

test('generation services match native incremental writes and queries',async()=>{
  for(const file of ['vanilla-189-world-services']) {
  const f=JSON.parse(gunzipSync(await readFile(new URL(`./fixtures/${file}.json.gz`,import.meta.url))));
  assert.deepEqual(BLOCK_PROPERTIES_189.map(row=>row.slice(0,f.palette[0].length)),f.palette);
  for(const c of f.cases) {
    const world=new GenerationWorld189({random:new JavaRandom(7n),minChunkX:(c.x>>4)-2,maxChunkX:(c.x>>4)+2,minChunkZ:(c.z>>4)-2,maxChunkZ:(c.z>>4)+2,
      loadColumn:(cx,cz)=>{const a=new Uint16Array(65536);a.fill(16,0,63*256);a.fill(32,63*256,64*256);return a;}});
    for(const [dx,y,dz,state] of c.initial)world.set(c.x+dx,y,c.z+dz,state);
    for(let step=0;step<c.snapshots.length;step++) {
      if(step){const [x,y,z,s]=c.edits[step-1];world.set(c.x+x,y,c.z+z,s);}
      for(const [dx,dz,h,top] of c.snapshots[step].heights) {
        assert.equal(world.height(c.x+dx,c.z+dz),h,`${c.name} ${step} height`);
        assert.equal(world.topSolidOrLiquid(c.x+dx,c.z+dz),top,`${c.name} ${step} top`);
      }
      for(const [dx,y,dz,state,expected] of c.snapshots[step].predicates??[])assert.equal(world.canPlace(state,c.x+dx,y,c.z+dz),expected,`${c.name} step ${step} predicate ${state} at ${dx},${y},${dz}`);
      for(const [dx,y,dz,sky,block,light] of c.snapshots[step].points) {
        const x=c.x+dx,z=c.z+dz,label=`${c.name} step ${step} ${dx},${y},${dz}`;
        assert.deepEqual([world.getSkyLight(x,y,z),world.getBlockLight(x,y,z),world.lightFromNeighbors(x,y,z)],[sky,block,light],label);
      }
    }
  }
  }
});

test('mutable host reuses native-tested immediate fluid updates without duplicate hooks',async()=>{
  const f=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-fluid-updates.json.gz',import.meta.url))));
  for(const c of f.cases) {
    const initial=new Map(c.initial.map(([x,y,z,s])=>[`${c.ox+x},${c.oy+y},${c.oz+z}`,s]));
    const base=(x,y,z)=>initial.get(`${x},${y},${z}`)??(y<63?16:y===63?c.surface:0);
    const r=new JavaRandom(BigInt(c.seed)),wr=new JavaRandom(BigInt(c.worldSeed));
    const world=new GenerationWorld189({random:wr,minChunkX:(c.ox>>4)-2,maxChunkX:(c.ox>>4)+2,minChunkZ:(c.oz>>4)-2,maxChunkZ:(c.oz>>4)+2,
      loadColumn:(cx,cz)=>{const a=new Uint16Array(65536);for(let y=0;y<256;y++)for(let z=0;z<16;z++)for(let x=0;x<16;x++)a[(y<<8)|(z<<4)|x]=base(cx*16+x,y,cz*16+z);return a;}});
    world.fluids.runImmediate(()=>world.fluids.tick(c.ox,c.oy,c.oz,r));
    assert.equal(r.nextInt(),c.rngAfter,`${c.scenario} feature RNG`);
    assert.equal(wr.nextInt(),c.worldRngAfter,`${c.scenario} world RNG`);
    const expected=new Map(c.blocks.map(([x,y,z,s])=>[`${c.ox+x},${c.oy+y},${c.oz+z}`,s]));
    for(const k of new Set([...expected.keys(),...world.changes.keys()])){const [x,y,z]=k.split(',').map(Number);assert.equal(world.get(x,y,z),expected.get(k)??base(x,y,z),`${c.liquid} ${c.scenario} ${k}`);}
  }
  assert.equal(f.cases.length,180);
});
