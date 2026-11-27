import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {GenerationWorld189} from '../client/js/local-world/generation/v1_8_9/generation-world.js';
import {JavaRandom} from '../client/js/local-world/java-random.js';
import {BLOCK_PROPERTIES_189} from '../client/js/local-world/generation/v1_8_9/block-properties.js';
import {compareGenerationWorld} from './compare-generation-world.mjs';

test('generation services match native incremental writes and queries',async()=>{
  for(const file of ['vanilla-189-world-services','vanilla-189-world-services-expanded']) {
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

test('section allocation, roof writes and explicit light services match native intermediate states',async()=>{
  const f=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-lighting-timing.json.gz',import.meta.url))));
  assert.equal(f.cases.length,8);
  for(const c of f.cases) {
    const world=new GenerationWorld189({random:new JavaRandom(7n),minChunkX:(c.x>>4)-2,maxChunkX:(c.x>>4)+2,minChunkZ:(c.z>>4)-2,maxChunkZ:(c.z>>4)+2,
      loadColumn:(cx,cz)=>{const a=new Uint16Array(65536);a.fill(16,0,63*256);a.fill(32,63*256,64*256);for(const [dx,y,dz,state]of c.initialRaw??[])if(((c.x+dx)>>4)===cx&&((c.z+dz)>>4)===cz)a[(y<<8)|(((c.z+dz)&15)<<4)|((c.x+dx)&15)]=state;return a;}});
    for(const [step,s]of c.steps.entries()) {
      const op=s.op;
      if(op[0]==='set')world.set(c.x+op[1],op[2],c.z+op[3],op[4]);
      else if(op[0]==='check')world.checkLight(true,c.x+op[1],op[2],c.z+op[3]);
      else if(op[0]==='check-block')world.checkLight(false,c.x+op[1],op[2],c.z+op[3]);
      else if(op[0]==='skymap')world.rebuildSkylight(world._chunk((c.x>>4)+op[1],(c.z>>4)+op[2]));
      for(const [dx,y,dz,sky,light,block]of s.points){const actual=[world.getSkyLight(c.x+dx,y,c.z+dz),world.lightFromNeighbors(c.x+dx,y,c.z+dz)],expected=[sky,light];if(block!==undefined){actual.push(world.getBlockLight(c.x+dx,y,c.z+dz));expected.push(block);}assert.deepEqual(actual,expected,`${c.material} ${c.x} step ${step} ${dx},${y},${dz}`);}
      for(const [dx,dz,present]of s.allocation)assert.equal(Boolean(world._chunk((c.x>>4)+dx,(c.z>>4)+dz).allocated[4]),present,`step ${step} section allocation`);
    }
  }
});

test('all 140 independent-host decoration invocations match blocks, light and both RNG streams',async()=>{
  const report=await compareGenerationWorld();
  assert.deepEqual(report.datasets.map(d=>[d.evaluated,d.matched,d.total,d.firstDifference]),[[118,118,118,null],[22,22,22,null]]);
  assert.equal(report.datasets.reduce((sum,d)=>sum+d.changedStatesMatched,0),502327);
  assert.equal(report.datasets.reduce((sum,d)=>sum+d.featureRngCallsCompared,0),1526416);
  assert.equal(report.datasets.reduce((sum,d)=>sum+d.finalRngValuePairsCompared,0),140);
  assert.equal(report.datasets.reduce((sum,d)=>sum+d.lightingQueriesCompared,0),5504);
  assert.equal(report.datasets.reduce((sum,d)=>sum+d.lightingValuesMatched,0),11008);
  assert.equal(report.datasets.reduce((sum,d)=>sum+d.blockStateInvocationsMatched,0),140);
  assert.equal(report.datasets.reduce((sum,d)=>sum+d.rngInvocationsMatched,0),140);
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
