// Node-only disposable streaming replay, not browser gameplay verification.
import {IDBFactory} from 'fake-indexeddb';
import {openCheckpointStore} from '../client/js/local-world/checkpoints.js';
import {ExperimentalDefaultTerrain189,createExperimentalGrowingTerrain,findSafeExperimentalSpawn} from '../client/js/local-world/generation/v1_8_9/experimental-default.js';
const [seed='-321252946616194827',direction='east',count='20']=process.argv.slice(2),steps=Number(count);
if(!['east','west','north','south'].includes(direction)||!Number.isInteger(steps)||steps<1||steps>100)throw Error('Usage: node tools/probe-experimental-exploration.mjs SEED east|west|north|south STEPS(1..100)');
const store=await openCheckpointStore('disposable-exploration',new IDBFactory());
const state={id:'exploration',seed,generator:{id:'java-1.8.9-default-experimental-stateful-v1',version:1},edits:[]};
const generator=new ExperimentalDefaultTerrain189(seed),terrain=createExperimentalGrowingTerrain(generator,state,store);
const execute=terrain.population.execute;
terrain.population.execute=context=>{
 let feature=null;const observe=context.decorator.observe;context.decorator.observe=e=>{observe(e);if(e.phase==='before')feature=e;};
 const get=context.world.getState.bind(context.world);
 context.world.getState=(x,y,z)=>{try{return get(x,y,z);}catch(error){
 error.generation={source:[context.x,context.z],requested:[x,y,z].map(v=>Number.isFinite(v)?v:String(v)),feature,
 bounds:[context.world.minChunkX,context.world.maxChunkX,context.world.minChunkZ,context.world.maxChunkZ],featureRandom:context.featureRandom.seed.toString(),worldRandom:context.worldRandom.seed.toString()};throw error;}};
 return execute(context);
};
try {
 const start=performance.now(),spawn=await findSafeExperimentalSpawn(generator,terrain),seen=new Set();
 console.log(JSON.stringify({seed,direction,spawn}));
 for(let step=0;step<steps;step++){
  const cx=Math.floor(spawn.x/16)+(direction==='east'?step:direction==='west'?-step:0),cz=Math.floor(spawn.z/16)+(direction==='south'?step:direction==='north'?-step:0),coordinates=[];
  for(let z=cz-8;z<=cz+8;z++)for(let x=cx-8;x<=cx+8;x++)if(!seen.has(`${x},${z}`))coordinates.push([x,z]);
  coordinates.sort((a,b)=>((a[0]-cx)**2+(a[1]-cz)**2)-((b[0]-cx)**2+(b[1]-cz)**2));
  for(const [x,z]of coordinates){await terrain.prepare(x,z);seen.add(`${x},${z}`);}
  console.log(JSON.stringify({step,uniqueColumns:seen.size}));
 }
 console.log(JSON.stringify({elapsedMs:performance.now()-start,metrics:terrain.population.metrics}));
} catch(error){console.error(JSON.stringify(error.generation??null));console.error(error.stack);process.exitCode=1;}
finally{store.close();}
