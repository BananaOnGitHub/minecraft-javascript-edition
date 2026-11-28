import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';
import {generateBigOakLimb189} from '../client/js/local-world/generation/v1_8_9/trees.js';
test('oak limbs match native zero-length and axis-state observations at both chunk signs',async()=>{
 const f=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-oak-limb.json.gz',import.meta.url))));assert.equal(f.cases.length,6);
 for(const c of f.cases){const states=new Map();const world={get(x,y,z){assert.ok([x,y,z].every(Number.isInteger),'finite integer read');return states.get(`${x},${y},${z}`)??0;},set(x,y,z,state){assert.ok([x,y,z].every(Number.isInteger),'finite integer write');states.set(`${x},${y},${z}`,state);}};
 generateBigOakLimb189(world,c.x,c.y,c.z,c.x+c.delta[0],c.y+c.delta[1],c.z+c.delta[2]);
 assert.deepEqual([...states].map(([key,state])=>{const [x,y,z]=key.split(',').map(Number);return [x-c.x,y-c.y,z-c.z,state];}),c.blocks);
 }
});

test('reported creative-flight population source (9,1) uses only finite in-region accesses',async()=>{
 const {GenerationWorld189}=await import('../client/js/local-world/generation/v1_8_9/generation-world.js');
 const {JavaRandom}=await import('../client/js/local-world/java-random.js');
 const {restoreDecorator,restoreWorld}=await import('../client/js/local-world/generation/v1_8_9/stateful-population.js');
 const {ExperimentalDefaultTerrain189}=await import('../client/js/local-world/generation/v1_8_9/experimental-default.js');
 const f=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/flight-population-input.json.gz',import.meta.url))));
 assert.equal(f.seed,'-321252946616194827');assert.deepEqual(f.source,[9,1]);
 const columns=new Map(f.columns.map(c=>[`${c.x},${c.z}`,c]));
 const random=new JavaRandom(0n);random.seed=BigInt(f.worldRandom);
 const featureRandom=new JavaRandom(0n);featureRandom.seed=BigInt(f.featureRandom);
 const world=new GenerationWorld189({random,minChunkX:8,maxChunkX:11,minChunkZ:0,maxChunkZ:3,
 loadColumn:(x,z)=>Uint16Array.from(columns.get(`${x},${z}`).sections.flatMap(s=>s.blocks))});
 restoreWorld(world,f.columns);
 const get=world.getState.bind(world);let reads=0;
 world.getState=(x,y,z)=>{assert.ok([x,y,z].every(Number.isInteger),`invalid read ${x},${y},${z}`);reads++;return get(x,y,z);};
 const decorator=restoreDecorator(f.decorator),seen=[];decorator.observe=e=>{if(e.phase==='before')seen.push(e);};
 new ExperimentalDefaultTerrain189(f.seed).execute({world,worldRandom:random,featureRandom,decorator,x:9,z:1,events:[]});
 assert.ok(reads>0);assert.ok(seen.some(e=>e.variant==='big-oak'&&e.x===167&&e.y===84&&e.z===39));
 for(const key of world.changes.keys())assert.ok(key.split(',').map(Number).every(Number.isInteger),key);
});
