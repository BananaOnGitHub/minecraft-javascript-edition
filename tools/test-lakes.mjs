import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {JavaRandom} from '../client/js/local-world/java-random.js';
import {GenerationWorld189} from '../client/js/local-world/generation/v1_8_9/generation-world.js';
import {biomeBaseTemperature189,canFreeze189} from '../client/js/local-world/generation/v1_8_9/climate.js';
import {generateLake189} from '../client/js/local-world/generation/v1_8_9/lakes.js';

test('isolated water and lava lakes match native states, return values and RNG',async()=>{
  const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-lakes.json.gz',import.meta.url))));
  assert.equal(fixture.cases.length,48);
  for(const c of fixture.cases){
    const initial=new Map(c.initial.map(([x,y,z,s])=>[`${c.x+x},${y},${c.z+z}`,s]));
    const base=(x,y,z)=>initial.get(`${x},${y},${z}`)??(y<63?16:y===63?32:0);
    const calls=[];
    class TracedRandom extends JavaRandom {
      nextInt(bound){calls.push(['nextInt',bound??null]);return super.nextInt(bound);}
      nextDouble(){calls.push(['nextDouble']);return super.nextDouble();}
    }
    const rng=new TracedRandom(BigInt(c.seed));
    const world=new GenerationWorld189({random:new JavaRandom(9001n),minChunkX:(c.x>>4)-2,maxChunkX:(c.x>>4)+2,minChunkZ:(c.z>>4)-2,maxChunkZ:(c.z>>4)+2,
      loadColumn:(cx,cz)=>{const a=new Uint16Array(65536);for(let y=0;y<256;y++)for(let z=0;z<16;z++)for(let x=0;x<16;x++)a[(y<<8)|(z<<4)|x]=base(cx*16+x,y,cz*16+z);return a;}});
    const label=`${c.liquid} ${c.seed} ${c.shape}`;
    const biome=c.shape==='snow'||c.shape==='ice'?12:c.shape==='mycelium'?14:1;
    const canFreezeWater=(x,y,z)=>canFreeze189(world,x,y,z,biomeBaseTemperature189(biome));
    assert.equal(generateLake189(world,rng,c.x,c.y,c.z,c.liquid,{canFreezeWater,topBlock:()=>c.shape==='mycelium'?1760:32}),c.ok,label+' return');
    assert.equal(rng.nextInt(),c.rngAfter,label+' RNG result');
    assert.deepEqual(calls,c.calls,label+' RNG calls');
    const expected=new Map(c.blocks.map(([x,y,z,s])=>[`${c.x+x},${y},${c.z+z}`,s]));
    for(const key of new Set([...expected.keys(),...world.changes.keys()])){const [x,y,z]=key.split(',').map(Number);assert.equal(world.get(x,y,z),expected.get(key)??base(x,y,z),label+' '+key);}
  }
});

test('lakes match native invocations on four unpopulated natural terrains',async()=>{
  const {Biomes189}=await import('../client/js/local-world/generation/v1_8_9/biomes.js');
  const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-natural-lakes.json.gz',import.meta.url))));
  assert.equal(fixture.cases.length,8);
  for(const c of fixture.cases){
    const sections=new Map();
    for(const section of c.input){const a=new Uint16Array(4096);let n=0;for(let i=0;i<section.runs.length;i+=2){a.fill(section.runs[i],n,n+section.runs[i+1]);n+=section.runs[i+1];}sections.set(section.section,a);}
    const base=(x,y,z)=>{const dx=(x>>4)-(c.x>>4),dz=(z>>4)-(c.z>>4),id=((dz+1)*4+dx+1)*16+(y>>4);return sections.get(id)?.[((y&15)<<8)|((z&15)<<4)|(x&15)]??0;};
    const calls=[];class TracedRandom extends JavaRandom {nextInt(bound){calls.push(['nextInt',bound??null]);return super.nextInt(bound);}nextDouble(){calls.push(['nextDouble']);return super.nextDouble();}}
    const random=new TracedRandom(BigInt(c.seed)),biomes=new Biomes189(7n),biomeCache=new Map();
    const biome=(x,z)=>{const k=`${x},${z}`;if(!biomeCache.has(k))biomeCache.set(k,biomes.sample(x,z,1,1)[0]);return biomeCache.get(k);};
    const world=new GenerationWorld189({random:new JavaRandom(7n),minChunkX:(c.x>>4)-1,maxChunkX:(c.x>>4)+2,minChunkZ:(c.z>>4)-1,maxChunkZ:(c.z>>4)+2,
      loadColumn:(cx,cz)=>{const a=new Uint16Array(65536);for(let y=0;y<256;y++)for(let z=0;z<16;z++)for(let x=0;x<16;x++)a[(y<<8)|(z<<4)|x]=base(cx*16+x,y,cz*16+z);return a;}});
    const label=`${c.x},${c.z} ${c.liquid}`;
    assert.equal(generateLake189(world,random,c.x,c.y,c.z,c.liquid,{canFreezeWater:(x,y,z)=>canFreeze189(world,x,y,z,biomeBaseTemperature189(biome(x,z))),topBlock:(x,y,z)=>biome(x,z)===14?1760:32}),c.ok,label+' return');
    assert.equal(random.nextInt(),c.rngAfter,label+' RNG result');assert.deepEqual(calls,c.calls,label+' RNG calls');
    const expected=new Map(c.blocks.map(([x,y,z,s])=>[`${c.x+x},${y},${c.z+z}`,s]));
    for(const key of new Set([...expected.keys(),...world.changes.keys()])){const [x,y,z]=key.split(',').map(Number);assert.equal(world.get(x,y,z),expected.get(key)??base(x,y,z),label+' '+key);}
  }
});
