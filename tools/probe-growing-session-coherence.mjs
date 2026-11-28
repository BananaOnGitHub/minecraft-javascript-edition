// Diagnostic for the disabled adapter's known cross-session notification gap.
// Returns nonzero on stale cached state. Not an accepted regression baseline.
import {IDBFactory} from 'fake-indexeddb';
import {openCheckpointStore} from '../client/js/local-world/checkpoints.js';
import {GrowingTerrain189} from '../client/js/local-world/generation/v1_8_9/growing-terrain.js';
const store=await openCheckpointStore('coherence-probe',new IDBFactory());
const generator={column:()=>({states:new Uint16Array(65536),biomes:new Uint8Array(256)}),minY:0,maxY:255,contains:()=>true};
const state={id:'probe',seed:'7',generator:{id:'coherence-probe',version:1},edits:[]};
const execute=({world})=>world.set(0,70,0,64);
try {
  const first=new GrowingTerrain189(generator,state,store,execute),second=new GrowingTerrain189(generator,state,store,execute);
  await first.prepare(0,0);
  for(const [x,z]of [[0,0],[1,0],[0,1],[1,1]])await second.prepare(x,z);
  const cached=first.column(0,0).states[70*256],durable=(await second.population.read(0,0)).states[70*256];
  const notifications=first.takeChangedColumns();
  console.log(JSON.stringify({cached,durable,notifications,matched:cached===durable},null,2));
  if(cached!==durable)process.exitCode=1;
} finally {store.close();}
