import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { openCheckpointStore } from '../client/js/local-world/checkpoints.js';
import { PersistedTerrain } from '../client/js/local-world/persisted-terrain.js';

const state = { id: 'test-world', generator: { id: 'test-feature-terrain', version: 1 }, edits: [] };
const generatorId = `${state.generator.id}:${state.generator.version}`;
const stageId = 'boundary-pattern-v1';
const arrayIndex = (x,y,z) => (y << 8) | ((z & 15) << 4) | (x & 15);

function generator(populate) {
  return {
    minY: 0, maxY: 255, chunkLimit: 2, viewDistanceLimit: 2,
    contains: (x,z) => x >= -32 && x < 32 && z >= -32 && z < 32,
    column() {
      const states = new Uint16Array(65536);
      states.fill(16,0,32*256);
      return { states, biomes: new Uint8Array(256).fill(1), lastSection: 1 };
    },
    population: { id: stageId, radius: 1, populate },
  };
}

// Original diagnostic pattern, deliberately overlapping source writes at both
// sides of a chunk boundary. The callback also checks its private write view.
function pattern(world,x,z) {
  const bx = x * 16, bz = z * 16, value = 96+(x+2)*4+(z+2);
  for (let dx = -1; dx <= 16; dx++) {
    if (!world.contains(bx+dx,80,bz)) continue;
    assert.equal(world.get(bx+dx,80,bz),0);
    world.set(bx+dx,80,bz,value);
    assert.equal(world.get(bx+dx,80,bz),value);
  }
}

test('overlapping cross-column batches are deterministic in reverse and concurrent exploration order', async () => {
  const results=[];
  for (const concurrent of [false,true]) {
    const store=await openCheckpointStore('population',new IDBFactory());
    try {
      const calls=new Set();
      const terrain=new PersistedTerrain(generator((world,x,z) => {
        const key=`${x},${z}`;
        assert.ok(!calls.has(key),'source evaluated once');
        calls.add(key);pattern(world,x,z);
      }),state,store);
      const coords=[[-1,0],[0,0],[0,-1]];
      if (concurrent) await Promise.all([...coords].reverse().map(([x,z]) => terrain.prepare(x,z)));
      else for (const [x,z] of coords) await terrain.prepare(x,z);
      results.push(coords.map(([x,z]) => terrain.column(x,z).states.slice()));
      // Both sides of the boundary at -1/0 use source (0,0) as winner.
      assert.equal(terrain.get(-1,80,0),106);
      assert.equal(terrain.get(0,80,0),106);
      assert.equal(terrain.get(-2,80,0),102);
      assert.equal(terrain.column(-1,0).lastSection,5);
      assert.equal((await store.loadChunk(state.id,-1,0)).states[arrayIndex(-1,80,0)],0);
      const batch=await store.loadPopulation(state.id,generatorId,stageId,0,0);
      assert.deepEqual(batch.targets.map(t=>[t.x,t.z]),[[-1,0],[0,0],[1,0]]);
    } finally { store.close(); }
  }
  assert.deepEqual(results[0],results[1]);
});

test('completed batches survive reopening and generated blocks remain separate from player edits', async () => {
  const idb=new IDBFactory();
  let store=await openCheckpointStore('population',idb);
  const record=await store.create(state.id,state);
  const terrain=new PersistedTerrain(generator(pattern),state,store);
  await terrain.prepare(-1,0);
  terrain.set(-1,80,0,0); // player removal of generated block
  terrain.set(-2,80,0,45<<4);
  await store.save(state.id,record.revision,{...state,edits:terrain.snapshot()});
  store.close();
  store=await openCheckpointStore('population',idb);
  try {
    const saved=(await store.load(state.id)).state;
    const noRegeneration=generator(()=>{throw new Error('Completed source regenerated');});
    noRegeneration.column=()=>{throw new Error('Stored raw column regenerated');};
    const reopened=new PersistedTerrain(noRegeneration,saved,store);
    await reopened.prepare(-1,0);
    assert.equal(reopened.get(-1,80,0),0);
    assert.equal(reopened.get(-2,80,0),45<<4);
    assert.equal(reopened.baseColumn(-1,0).states[arrayIndex(-1,80,0)],106);
    reopened.set(-1,80,0,106);
    reopened.set(-2,80,0,102);
    assert.equal(reopened.editCount,0);
  } finally { store.close(); }
});

test('failed feature callbacks do not publish partial writes and can be retried', async () => {
  const store=await openCheckpointStore('population',new IDBFactory());
  try {
    let fail=true;
    const terrain=new PersistedTerrain(generator((world,x,z) => {
      world.set(x*16,80,z*16,96);
      if (fail) throw new Error('deliberate failure');
      if (world.contains(x*16+16,80,z*16)) world.set(x*16+16,80,z*16,97);
    }),state,store);
    await assert.rejects(terrain.prepare(0,0),/deliberate failure/);
    assert.equal(await store.loadPopulation(state.id,generatorId,stageId,-1,-1),undefined);
    assert.equal((await store.loadChunk(state.id,-1,-1)).states[arrayIndex(-16,80,-16)],0);
    assert.throws(()=>terrain.column(0,0),/prepared/);
    fail=false;
    await terrain.prepare(0,0);
    assert.equal(terrain.get(0,80,0),96);
    assert.ok(await store.loadPopulation(state.id,generatorId,stageId,-1,-1));
  } finally { store.close(); }
});

test('first committed batch wins across storage connections, and empty batches count as complete', async () => {
  const idb=new IDBFactory(),a=await openCheckpointStore('population',idb),b=await openCheckpointStore('population',idb);
  try {
    const record={worldId:state.id,generatorId,stageId,x:0,z:0,targets:[]};
    const alternative={...record,targets:[{x:0,z:0,changes:[[80*256,96]]}]};
    const [first,second]=await Promise.all([a.savePopulation(record),b.savePopulation(alternative)]);
    assert.deepEqual(first,second);
    assert.deepEqual(await b.loadPopulation(state.id,generatorId,stageId,0,0),first);
    const empty=generator(()=>{throw new Error('Empty completed source reran');});
    empty.population.radius=0;
    const terrain=new PersistedTerrain(empty,state,a);
    await terrain.prepare(0,0);
    assert.equal(terrain.get(0,80,0),0);
  } finally { a.close(); b.close(); }
});

test('population callbacks cannot modify undeclared columns or publish asynchronous changes', async () => {
  const store=await openCheckpointStore('population',new IDBFactory());
  try {
    const testGenerator=generator((world,x,z)=>world.set(x*16+32,80,z*16,96));
    const terrain=new PersistedTerrain(testGenerator,state,store);
    await assert.rejects(terrain.prepare(0,0),/declared neighborhood/);
    testGenerator.population.populate=async (world,x,z)=>world.set(x*16,80,z*16,96);
    const asyncTerrain=new PersistedTerrain(testGenerator,state,store);
    await assert.rejects(asyncTerrain.prepare(0,0),/synchronous/);
    assert.equal(await store.loadPopulation(state.id,generatorId,stageId,-1,-1),undefined);
  } finally { store.close(); }
});

test('upgrading an existing chunk database retains raw terrain and checkpoint revisions', async () => {
  const idb=new IDBFactory();
  await new Promise((resolve,reject) => {
    const request=idb.open('population',2);
    request.onupgradeneeded=()=>{
      const database=request.result;
      database.createObjectStore('checkpoints',{keyPath:'id'}).add({id:state.id,state,revision:9});
      const states=new Uint16Array(65536);states[80*256]=91;
      database.createObjectStore('world-chunks',{keyPath:['worldId','x','z']}).add({
        worldId:state.id,generatorId,x:0,z:0,states,biomes:new Uint8Array(256),lastSection:5,
      });
    };
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{request.result.close();resolve();};
  });
  const store=await openCheckpointStore('population',idb);
  try {
    assert.equal((await store.load(state.id)).revision,9);
    assert.equal((await store.loadChunk(state.id,0,0)).states[80*256],91);
    assert.equal(await store.loadPopulation(state.id,generatorId,stageId,0,0),undefined);
    const oldGenerator=generator(()=>{throw new Error('Legacy world ran population');});
    delete oldGenerator.population;
    oldGenerator.column=()=>{throw new Error('Legacy chunk regenerated');};
    const terrain=new PersistedTerrain(oldGenerator,state,store);
    await terrain.prepare(0,0);
    assert.equal(terrain.get(0,80,0),91);
  } finally { store.close(); }
});
