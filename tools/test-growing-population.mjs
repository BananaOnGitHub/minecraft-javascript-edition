import {test} from 'node:test';import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {openCheckpointStore} from '../client/js/local-world/checkpoints.js';
import {GrowingPopulation189} from '../client/js/local-world/generation/v1_8_9/growing-population.js';
const base=()=>{const states=new Uint16Array(65536);states.fill(16,0,63*256);states.fill(32,63*256,64*256);return {states,biomes:new Uint8Array(256).fill(1)};};
async function setup(execute){const store=await openCheckpointStore('growing',new IDBFactory()),options={worldId:'grow',generatorId:'research-growing',stageId:'v2',seed:7n,store,execute,
 loadBase:async(x,z)=>{let c=await store.loadChunk('grow',x,z);if(!c)c=await store.saveChunk({...base(),worldId:'grow',generatorId:'research-growing',x,z});return c;}};
 return {store,options,engine:new GrowingPopulation189(options)};}
async function square(engine,x,z){for(const [dx,dz]of [[0,0],[1,0],[0,1],[1,1]])await engine.prepare(x+dx,z+dz);}

test('growing persistence explores beyond 64 columns with bounded windows and no old-column rewrites',async()=>{
 const {store,options,engine}=await setup(({world,x,z})=>world.set(x*16+16,70,z*16,64));
 await square(engine,-2,-2);
 const first=await store.loadGenerationWindow(engine.identity,[[-1,-2]]);const revision=first.columns[0].revision;
 for(let x=2;x<72;x++)await square(engine,x,-2);
 assert.equal(engine.metrics.peakResidentColumns,16);
 const after=await store.loadGenerationWindow(engine.identity,[[-1,-2]]);assert.equal(after.columns[0].revision,revision);
 const reopened=new GrowingPopulation189(options);assert.equal((await reopened.read(-1,-2)).states[70*256],64);
 const sequence=after.meta.sequence;await square(reopened,71,-2);assert.equal((await store.loadGenerationWindow(engine.identity,[])).meta.sequence,sequence);
 store.close();
});

test('durable admission queue survives failed population and resumes exactly once',async()=>{
 let fail=true;const {store,options,engine}=await setup(({world,x,z})=>{world.set(x*16,70,z*16,64);if(fail)throw Error('failed');});
 await engine.prepare(-1,-1);await engine.prepare(0,-1);await engine.prepare(-1,0);
 await assert.rejects(engine.prepare(0,0),/failed/);
 let state=await store.loadGenerationWindow(engine.identity,[[-1,-1]]);assert.deepEqual(state.meta.pending,[[-1,-1]]);assert.equal(state.columns[0].population,'pending');assert.equal(state.columns[0].generated,undefined);
 fail=false;const reopened=new GrowingPopulation189(options);await reopened.prepare(0,0);
 state=await store.loadGenerationWindow(engine.identity,[[-1,-1]]);assert.equal(state.meta.sequence,1);assert.equal(state.columns[0].population,'completed');assert.deepEqual(state.meta.pending,[]);store.close();
});

test('light-only halo writes and deferred effects survive reopen; CAS publishes completion atomically',async()=>{
 const {store,options,engine}=await setup(({world})=>{world.checkLight(false,0,64,0);world._chunk(1,0).setSkyLight(0,70,0,6);world.fluids.request(17,70,0,'water');});
 await square(engine,0,0);
 const {columns,meta}=await store.loadGenerationWindow(engine.identity,[[1,0],[0,0]]);assert.equal(meta.sequence,1);
 const halo=columns.find(c=>c.x===1);assert.equal(halo.generated.sections[4].skyLight[(6*256)>>1]&15,6);assert.equal(halo.scheduled.length,1);
 const revision=meta.revision;await assert.rejects(store.commitGenerationWindow(meta,[],revision-1),/conflict/);assert.equal((await store.loadGenerationWindow(engine.identity,[])).meta.revision,revision);
 const reopened=new GrowingPopulation189(options);await reopened.prepare(1,1);assert.equal((await store.loadGenerationWindow(engine.identity,[])).meta.sequence,1);store.close();
});

test('streaming adapter refreshes cached columns after cross-chunk population without losing edits',async()=>{
 const {GrowingTerrain189}=await import('../client/js/local-world/generation/v1_8_9/growing-terrain.js');
 const store=await openCheckpointStore('adapter',new IDBFactory());
 const generator={column:base,minY:0,maxY:255,contains:()=>true,chunkLimit:10000,viewDistanceLimit:4};
 const state={id:'adapter',seed:'7',generator:{id:'growing-adapter-test',version:1},edits:[]};
 const terrain=new GrowingTerrain189(generator,state,store,({world})=>world.set(0,70,0,64));
 await terrain.prepare(0,0);terrain.set(0,70,0,96);terrain.set(1,63,0,0);
 for(const [x,z]of [[1,0],[0,1],[1,1]])await terrain.prepare(x,z);
 assert.equal(terrain.column(0,0).states[70*256],96);assert.equal(terrain.column(0,0).states[63*256+1],0);
 assert.ok(terrain.takeChangedColumns().some(c=>c.x===0&&c.z===0));
 const reopened=new GrowingTerrain189(generator,{...state,edits:terrain.snapshot()},store,()=>{throw Error('duplicate');});
 await reopened.prepare(0,0);assert.equal(reopened.column(0,0).states[70*256],96);assert.equal(reopened.baseColumn(0,0).states[70*256],64);
 store.close();
});

test('native readiness fixtures also drive durable admission in the same order',async()=>{
 const {readFile}=await import('node:fs/promises'),{gunzipSync}=await import('node:zlib');
 const f=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-population-readiness.json.gz',import.meta.url))));
 for(const c of f.cases){const events=[];const {engine,store}=await setup(({x,z})=>events.push([x,z]));
  for(const step of c.steps){await engine.prepare(c.x+step.loaded[0],c.z+step.loaded[1]);assert.deepEqual(events,step.populations);}
  store.close();}
});

test('multi-store commit abort rolls back every affected column and metadata',async()=>{
 const {store,engine}=await setup(()=>{});await square(engine,0,0);
 const snapshot=await store.loadGenerationWindow(engine.identity,[[0,0]]),meta=snapshot.meta,old=snapshot.columns[0];
 await assert.rejects(store.commitGenerationWindow({...meta,sequence:999},[{...old,population:'bad'},{...old,worldId:'wrong'}],meta.revision),/identity mismatch/);
 const after=await store.loadGenerationWindow(engine.identity,[[0,0]]);assert.deepEqual(after,snapshot);store.close();
});

test('concurrent sessions preserve distinct admissions and execute each completed source once',async()=>{
 const {store,options,engine}=await setup(({world,x,z})=>world.set(x*16,70,z*16,64));
 const other=new GrowingPopulation189(options);
 await Promise.all([engine.prepare(0,0),other.prepare(1,0),engine.prepare(0,1),other.prepare(1,1)]);
 const state=await store.loadGenerationWindow(engine.identity,[[0,0]]);assert.equal(state.meta.sequence,1);assert.equal(state.columns[0].population,'completed');store.close();
});
