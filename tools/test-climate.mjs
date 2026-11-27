import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';
import {JavaRandom} from '../client/js/local-world/java-random.js';
import {GenerationWorld189} from '../client/js/local-world/generation/v1_8_9/generation-world.js';
import {biomeBaseTemperature189,temperature189,precipitationHeight189,canFreeze189,canSnow189} from '../client/js/local-world/generation/v1_8_9/climate.js';

test('climate and surface queries match native biome and block observations',async()=>{
 const f=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-freeze-services.json.gz',import.meta.url))));assert.equal(f.cases.length,48);
 for(const c of f.cases){
  assert.equal(temperature189(c.baseTemp,c.x,c.y,c.z),c.temperature,`biome ${c.biome} temperature ${c.y}`);
  for(const o of c.observations){
   const world=new GenerationWorld189({random:new JavaRandom(7n),minChunkX:(c.x>>4)-2,maxChunkX:(c.x>>4)+2,minChunkZ:(c.z>>4)-2,maxChunkZ:(c.z>>4)+2,
    loadColumn:(cx,cz)=>{const a=new Uint16Array(65536);a.fill(16,0,63*256);a.fill(32,63*256,64*256);if(cx===c.x>>4&&cz===c.z>>4)a[(c.y<<8)|((c.z&15)<<4)|(c.x&15)]=o.state;return a;}});
   const label=`${c.biome} ${c.x} ${c.y} state ${o.state}`;
   assert.equal(precipitationHeight189(world,c.x,c.z),o.height,label+' precipitation');
   assert.equal(canFreeze189(world,c.x,c.y,c.z,c.baseTemp),o.freeze,label+' freeze');
   assert.equal(canFreeze189(world,c.x,c.y,c.z,c.baseTemp,true),o.freezeEdge,label+' edge');
   assert.equal(canSnow189(world,c.x,c.y,c.z,c.baseTemp,false),o.snow,label+' snow climate');
   assert.equal(canSnow189(world,c.x,c.y,c.z,c.baseTemp,true),o.snowLight,label+' snow placement');
  }
 }
});

test('isolated freeze and snow pass matches native world queries across chunk boundaries',async()=>{
 const {freezeAndSnow189}=await import('../client/js/local-world/generation/v1_8_9/climate.js');
 const f=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-freeze-pass.json.gz',import.meta.url))));assert.equal(f.cases.length,12);
 for(const c of f.cases){
  const init=new Map(c.initial.map(([x,y,z,s])=>[`${c.x+x},${y},${c.z+z}`,s]));
  const base=(x,y,z)=>init.get(`${x},${y},${z}`)??(y<63?16:y===63?32:0);
  const world=new GenerationWorld189({random:new JavaRandom(7n),minChunkX:(c.x>>4)-2,maxChunkX:(c.x>>4)+2,minChunkZ:(c.z>>4)-2,maxChunkZ:(c.z>>4)+2,
    loadColumn:(cx,cz)=>{const a=new Uint16Array(65536);for(let y=0;y<256;y++)for(let z=0;z<16;z++)for(let x=0;x<16;x++)a[(y<<8)|(z<<4)|x]=base(cx*16+x,y,cz*16+z);return a;}});
  freezeAndSnow189(world,c.x>>4,c.z>>4,()=>c.baseTemp);
  const expected=new Map(c.blocks.map(([x,y,z,s])=>[`${c.x+x},${y},${c.z+z}`,s]));
  for(const key of new Set([...expected.keys(),...world.changes.keys()])){const [x,y,z]=key.split(',').map(Number);assert.equal(world.get(x,y,z),expected.get(key)??base(x,y,z),`biome ${c.biome} ${key}`);}
 }
});

test('snow support rules match native block and metadata observations',async()=>{
 const f=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-snow-support.json.gz',import.meta.url))));assert.equal(f.cases.length,4);
 for(const c of f.cases)for(const o of c.observations){
  const world=new GenerationWorld189({random:new JavaRandom(7n),minChunkX:(c.x>>4)-2,maxChunkX:(c.x>>4)+2,minChunkZ:(c.z>>4)-2,maxChunkZ:(c.z>>4)+2,
   loadColumn:(cx,cz)=>{const a=new Uint16Array(65536);a.fill(16,0,63*256);a.fill(32,63*256,64*256);if(cx===(c.x>>4)&&cz===(c.z>>4)){a[((c.y-1)<<8)|((c.z&15)<<4)|(c.x&15)]=o.support;a[(c.y<<8)|((c.z&15)<<4)|(c.x&15)]=0;}return a;}});
  assert.equal(canSnow189(world,c.x,c.y,c.z,0,true),o.canSnow,`support ${o.support} at y ${c.y}`);
 }
});

test('freeze and snow honor enclosed water and block light',async()=>{
 const f=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-climate-edges.json.gz',import.meta.url))));assert.equal(f.cases.length,8);
 for(const c of f.cases){
  const initial=new Map(c.initial.map(([dx,dy,dz,s])=>[`${c.x+dx},${c.y+dy},${c.z+dz}`,s]));
  const world=new GenerationWorld189({random:new JavaRandom(7n),minChunkX:(c.x>>4)-2,maxChunkX:(c.x>>4)+2,minChunkZ:(c.z>>4)-2,maxChunkZ:(c.z>>4)+2,
   loadColumn:(cx,cz)=>{const a=new Uint16Array(65536);a.fill(16,0,63*256);a.fill(32,63*256,64*256);for(const [key,s]of initial){const [x,y,z]=key.split(',').map(Number);if((x>>4)===cx&&(z>>4)===cz)a[(y<<8)|((z&15)<<4)|(x&15)]=s;}return a;}});
  if(c.scenario==='lit'||c.scenario==='lit-water')world.set(c.x+1,c.y,c.z,50<<4);
  const label=`${c.x} ${c.scenario}`;
  assert.equal(world.getBlockLight(c.x,c.y,c.z),c.block,label+' light');
  assert.equal(canFreeze189(world,c.x,c.y,c.z,0,false),c.freeze,label+' freeze');
  assert.equal(canFreeze189(world,c.x,c.y,c.z,0,true),c.edge,label+' edge');
  assert.equal(canSnow189(world,c.x,c.y,c.z,0,true),c.snow,label+' snow');
  assert.equal(canFreeze189(world,c.x,c.y,c.z,0,false),c.methodV,label+' native method v');
  assert.equal(canFreeze189(world,c.x,c.y,c.z,0,true),c.methodW,label+' native method w');
 }
});


test('base biome temperatures match the native biome registry',async()=>{
 const f=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-biome-climate.json.gz',import.meta.url))));
 assert.equal(f.cases[0].biomes.length,61);
 for(const [id,value]of f.cases[0].biomes)assert.equal(biomeBaseTemperature189(id),value,`biome ${id}`);
 assert.throws(()=>biomeBaseTemperature189(255),/Unknown/);
});
