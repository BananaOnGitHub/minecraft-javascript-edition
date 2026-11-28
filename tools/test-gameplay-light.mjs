import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {IDBFactory} from 'fake-indexeddb';
import {gameplayLight189} from '../client/js/local-world/generation/v1_8_9/gameplay-light.js';
import {DefaultTerrain189} from '../client/js/local-world/generation/v1_8_9/default.js';
import {GrowingTerrain189} from '../client/js/local-world/generation/v1_8_9/growing-terrain.js';
import {openCheckpointStore} from '../client/js/local-world/checkpoints.js';
import {chunkPacket} from '../client/js/local-world/protocol.js';
import {decodePacket} from '../client/js/net/packets.js';
import {World} from '../client/js/world/world.js';
import {initBlocks} from '../client/js/world/blocks.js';
import {Mesher} from '../client/js/render/mesher.js';
import {updateLightmap} from '../client/js/render/sky.js';

const fixture=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/vanilla-189-gameplay-light.json.gz',import.meta.url))));
function columns(c){return new Map(c.columns.map(col=>{
  const states=new Uint16Array(65536);
  for(const s of col.sections){let i=s.sy*4096;for(let r=0;r<s.runs.length;r+=2){states.fill(s.runs[r],i,i+s.runs[r+1]);i+=s.runs[r+1];}}
  return [`${col.x},${col.z}`,{states,biomes:new Uint8Array(256).fill(2)}];
}));}
const nibble=(a,i)=>a[i>>1]>>((i&1)*4)&15;
function compare(column,points,label){for(const [x,y,z,state,sky,block]of points){const i=y*256+z*16+x;
  assert.equal(column.states[i],state,`${label} state ${x},${y},${z}`);
  assert.equal(nibble(column.skyLight,i),sky,`${label} sky ${x},${y},${z}`);
  assert.equal(nibble(column.blockLight,i),block,`${label} block ${x},${y},${z}`);
}}

test('settled gameplay lighting matches native overhang, canopy, fluid and emitter observations at both chunk signs',()=>{
  assert.equal(fixture.cases.length,7);
  for(const c of fixture.cases){const cols=columns(c),load=(x,z)=>cols.get(`${x},${z}`);
    const before=[...cols.values()].map(c=>c.states.slice());
    compare(gameplayLight189(c.x,c.z,load),c.settled,c.name);
    if(c.edited){const edits=new Map();
      // Light derivation reads the final states, including native non-light
      // neighbor callbacks (e.g. leaf decay bits after removing a block).
      for(const [x,y,z,state]of c.editChanges){const key=`${x>>4},${z>>4}`;
        if(!edits.has(key))edits.set(key,new Map());edits.get(key).set(y*256+(z&15)*16+(x&15),state);}
      compare(gameplayLight189(c.x,c.z,load,edits),c.edited,c.name+' edited');}
    [...cols.values()].forEach((c,i)=>assert.deepEqual(c.states,before[i],'input immutable'));
  }
});

test('reported seed terrain matches native inputs exactly and native maintenance fixes its dark exposed cavities',()=>{
  const gen=new DefaultTerrain189(BigInt(fixture.cases[0].seed));let differing=0;
  for(const c of fixture.cases.filter(c=>c.seed)){
    for(const [key,col]of columns(c)){const [x,z]=key.split(',').map(Number);assert.deepEqual(gen.carvedColumn(x,z).states,col.states,`${key} terrain`);}
    // Native normal chunk maintenance agrees with full explicit settling here.
    assert.deepEqual(c.maintained,c.settled,c.name);
    for(let i=0;i<c.initial.length;i++)if(c.initial[i][4]!==c.settled[i][4])differing++;
  }
  assert.equal(differing,338);
  const c=fixture.cases.find(c=>c.name==='reported-west-overhang');
  assert.deepEqual(c.initial.find(p=>p[0]===6&&p[1]===85&&p[2]===9),[6,85,9,0,0,0]);
  assert.deepEqual(c.settled.find(p=>p[0]===6&&p[1]===85&&p[2]===9),[6,85,9,0,14,0]);
});

test('protocol 47, client chunk loading, AO and lightmap preserve settled native samples',()=>{
  initBlocks(JSON.parse(readFileSync(new URL('../client/data/blocks.json',import.meta.url),'utf8')),null);
  const c=fixture.cases.find(c=>c.name==='reported-west-overhang'),cols=columns(c);
  const column=gameplayLight189(c.x,c.z,(x,z)=>cols.get(`${x},${z}`));
  const p=decodePacket(chunkPacket({minY:0,column:()=>column},c.x,c.z)),world=new World();
  world.loadChunk(c.x,c.z,true,p.bitMap,p.chunkData,0,true);
  for(const [x,y,z,state,sky,block]of c.settled){
    assert.equal(world.getState(c.x*16+x,y,c.z*16+z),state);
    assert.equal(world.getSkyLight(c.x*16+x,y,c.z*16+z),sky);
    assert.equal(world.getBlockLight(c.x*16+x,y,c.z*16+z),block);
  }
  const mesh=new Mesher({getState:(x,y,z)=>world.getState(x,y,z),getBiome:()=>2,
    getLight:(x,y,z)=>(world.getSkyLight(x,y,z)<<4)|world.getBlockLight(x,y,z)}, {atlas:{uv:()=>null}});
  assert.equal(mesh.lightAt(102,85,9),14<<4);
  const corners=Array.from({length:4},()=>new Float32Array(3));
  mesh.faceCorners(102,85,9,0,corners);
  assert.ok(corners.every(c=>c[1]>0),'smooth light preserves diffuse sky');
  const data=new Uint8Array(1024);updateLightmap(data,{sun:1,dimension:0,torchFlicker:0,gamma:0});
  assert.ok(data[14*16*4]>data[0],'correct sky levels brighten the lightmap without changing gamma');
});

test('gameplay light is derived separately, persists edits and refreshes untouched border columns without population admission',async()=>{
  const base=()=>{const states=new Uint16Array(65536);states.fill(16,0,64*256);return {states,biomes:new Uint8Array(256).fill(1)};};
  const store=await openCheckpointStore('gameplay-light',new IDBFactory());
  const generator={column:base,minY:0,maxY:255,contains:()=>true,chunkLimit:10000,viewDistanceLimit:4};
  const state={id:'light-separation',seed:'7',generator:{id:'gameplay-light-test',version:1},edits:[]};
  const terrain=new GrowingTerrain189(generator,state,store,({world})=>{
    world.set(16,65,0,1424);world._chunk(0,0).setSkyLight(0,70,0,6);
  });
  await terrain.prepare(0,0);
  let persisted=await store.loadGenerationWindow(terrain.population.identity,[[0,0],[1,0]]);
  assert.equal(persisted.meta.sequence,0,'read-only halo cannot admit sources');
  assert.equal(persisted.columns.length,1,'halo has no admission metadata');
  for(const [x,z]of [[1,0],[0,1],[1,1]])await terrain.prepare(x,z);
  assert.ok(terrain.takeChangedColumns().some(c=>c.x===0&&c.z===0));
  const cached=await terrain.population.read(0,0);
  assert.equal(nibble(cached.skyLight,70*256),6,'original population cache retained');
  assert.equal(nibble(terrain.column(0,0).skyLight,70*256),15,'gameplay settles cached sky');
  assert.equal(nibble(terrain.column(0,0).blockLight,65*256+15),14,'emitter across border');
  const before=await store.loadGenerationWindow(terrain.population.identity,[[0,0],[1,0]]);
  terrain.set(16,65,0,0);await terrain.flushLighting();
  assert.equal(nibble(terrain.column(0,0).blockLight,65*256+15),0,'removal updates untouched neighbor');
  assert.ok(terrain.takeChangedColumns().some(c=>c.x===0&&c.z===0));
  const reopen=new GrowingTerrain189(generator,{...state,edits:terrain.snapshot()},store,()=>{throw Error('duplicate');});
  await reopen.prepare(0,0);
  assert.equal(nibble(reopen.column(0,0).blockLight,65*256+15),0,'reload applies neighboring edit');
  const after=await store.loadGenerationWindow(terrain.population.identity,[[0,0],[1,0]]);
  assert.deepEqual(after,before,'deriving presentation light never rewrites persisted generation state or RNG');
  assert.ok(terrain.lightInputs.size<=64);assert.ok(terrain.gameplay.size<=384);
  store.close();
});
