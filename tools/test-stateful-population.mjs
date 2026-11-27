import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {openCheckpointStore} from '../client/js/local-world/checkpoints.js';
import {StatefulPopulation189} from '../client/js/local-world/generation/v1_8_9/stateful-population.js';
import {partialPopulationSequence189} from '../client/js/local-world/generation/v1_8_9/population-sequence.js';
import {BigOakTree189} from '../client/js/local-world/generation/v1_8_9/trees.js';
const bounds={minChunkX:-2,maxChunkX:2,minChunkZ:-2,maxChunkZ:2};
const base=()=>{const states=new Uint16Array(65536);states.fill(16,0,63*256);states.fill(32,63*256,64*256);return {states,biomes:new Uint8Array(256).fill(1)};};
async function setup(execute,store){
  store??=await openCheckpointStore('stateful',new IDBFactory());
  const options={worldId:'world',generatorId:'research-only',stageId:'journal-v1',seed:7n,bounds,store,execute,
    loadBase:async(x,z)=>{let c=await store.loadChunk('world',x,z);if(!c)c=await store.saveChunk({...base(),worldId:'world',generatorId:'research-only',x,z});return c;}};
  return {store,options,engine:new StatefulPopulation189(options)};
}

test('stateful calls observe previous cross-chunk writes and preserve explicit order on reopen',async()=>{
  const execute=({world,x,z,decorator,worldRandom})=>{
    const old=world.get(0,70,0);world.set(0,70,0,old+16);world.set(x*16+16,71,z*16,64);
    if(!decorator.bigOaks.has(4))decorator.bigOaks.set(4,Object.assign(new BigOakTree189(),{heightLimit:14,leafDistanceLimit:5}));
    assert.equal(decorator.bigOaks.get(4).heightLimit,14);
    worldRandom.nextInt();world.fluids.request(0,70,0,'water');
  };
  const {store,options,engine}=await setup(execute);
  await Promise.all([engine.populate(-1,-1),engine.populate(0,0)]);
  const before=await engine.journal();assert.equal(before.revision,2);assert.deepEqual(before.completed,[[-1,-1],[0,0]]);
  const reopened=new StatefulPopulation189(options),context=await reopened.context(before);
  assert.equal(context.world.get(0,70,0),32);assert.equal(context.world.fluids.scheduled.length,2);
  assert.deepEqual((await reopened.populate(0,0)),before,'completed source must not run twice');
  assert.deepEqual(context.world._chunk(0,0).allocated,before.columns.find(c=>c.x===0&&c.z===0).allocated);
  assert.deepEqual(context.world._chunk(0,0).heightMap,before.columns.find(c=>c.x===0&&c.z===0).heightMap);
  assert.deepEqual(context.world._chunk(0,0).sections[4].skyLight,before.columns.find(c=>c.x===0&&c.z===0).sections[4].skyLight);
  assert.equal(context.worldRandom.seed.toString(),before.worldRandom);
  assert.equal((await store.loadChunk('world',0,0)).states[70*256],0,'raw terrain remains immutable');store.close();
});

test('failed execution or failed durable commit cannot publish writes or completion',async()=>{
  const {store,options,engine}=await setup(({world})=>{world.set(0,70,0,64);throw Error('feature failed');});
  await assert.rejects(engine.populate(0,0),/feature failed/);assert.equal(await engine.journal(),undefined);
  const rejected={...store,commitStatefulPopulation:async()=>{throw Error('quota');}};
  await assert.rejects(new StatefulPopulation189({...options,store:rejected,execute:({world})=>world.set(0,70,0,96)}).populate(0,0),/quota/);
  assert.equal(await engine.journal(),undefined);
  const retry=new StatefulPopulation189({...options,execute:({world})=>{assert.equal(world.get(0,70,0),0);world.set(0,70,0,96);}});
  assert.equal((await retry.populate(0,0)).revision,1);store.close();
});

test('concurrent sessions conflict atomically and retry from the committed generation state',async()=>{
  const {store,options}=await setup(({world})=>world.set(0,70,0,world.get(0,70,0)+16));
  const sessions=[new StatefulPopulation189(options),new StatefulPopulation189(options)];
  const results=await Promise.allSettled([sessions[0].populate(-1,0),sessions[1].populate(0,0)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const failed=results.findIndex(r=>r.status==='rejected');assert.match(results[failed].reason.message,/revision conflict/);
  await sessions[failed].populate(failed===0?-1:0,0);
  const record=await sessions[0].journal();assert.equal(record.revision,2);assert.equal((await sessions[0].context(record)).world.get(0,70,0),32);store.close();
});

test('unsupported stages reject by default and the research arena enforces readiness',async()=>{
  const execute=partialPopulationSequence189({biomeAt:()=>1});
  const {engine,store}=await setup(execute);
  await assert.rejects(engine.populate(0,0),/Unsupported population stage: structures/);
  assert.equal(await engine.journal(),undefined);
  await assert.rejects(engine.populate(2,0),/halo/);store.close();
});

test('partial sequence matches actual native provider RNG prefix through first dungeon boundary',async()=>{
  const {readFile}=await import('node:fs/promises'),{gunzipSync}=await import('node:zlib');
  const {JavaRandom}=await import('../client/js/local-world/java-random.js');
  const {populationSeed189}=await import('../client/js/local-world/generation/v1_8_9/population-seed.js');
  const {GenerationWorld189}=await import('../client/js/local-world/generation/v1_8_9/generation-world.js');
  const f=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-population-prefix.json.gz',import.meta.url))));
  assert.equal(f.cases.length,4);
  for(const c of f.cases){
    assert.equal(c.stopped,true);assert.match(c.error,/CAPTURE_LIMIT/);
    const log=[];class Trace extends JavaRandom {nextInt(bound){log.push(['nextInt',bound??null]);return super.nextInt(bound);}nextDouble(){log.push(['nextDouble',null]);return super.nextDouble();}}
    const random=new Trace(populationSeed189(BigInt(c.worldSeed),c.x,c.z));
    const world=new GenerationWorld189({random:new JavaRandom(7n),minChunkX:c.x-1,maxChunkX:c.x+2,minChunkZ:c.z-1,maxChunkZ:c.z+2,loadColumn:()=>base().states});
    const execute=partialPopulationSequence189({biomeAt:()=>1,structures:()=>false,dungeons:({random})=>{random.nextInt(2);throw Error('dungeon-boundary');}});
    assert.throws(()=>execute({world,worldRandom:world.random,featureRandom:random,decorator:null,x:c.x,z:c.z,events:[]}),/dungeon-boundary/);
    assert.equal(c.events[3][1],populationSeed189(7n,c.x,c.z).toString());
    assert.deepEqual(log,c.events.slice(4).map(([method,bound])=>[method,bound]),`source ${c.x},${c.z}`);
  }
});

test('changing source admission order changes observable generated state',async()=>{
  const values=[];
  for(const order of [[-1,0],[0,-1]]){
    const {engine,store}=await setup(({world,x})=>world.set(0,70,0,((world.get(0,70,0)>>4)*10+(x<0?1:2))<<4));
    for(const x of order)await engine.populate(x,0);
    values.push((await engine.context(await engine.journal())).world.get(0,70,0));store.close();
  }
  assert.deepEqual(values,[12<<4,21<<4]);
});

test('generation journal does not alter player checkpoints or their revisions',async()=>{
  const {engine,store}=await setup(({world})=>world.set(0,70,0,32));
  const edits={edits:[['0,0',[[70*256,0]]]],position:[1,72,1]};await store.create('world',edits);
  const before=await store.load('world');await engine.populate(0,0);
  assert.deepEqual(await store.load('world'),before);store.close();
});
