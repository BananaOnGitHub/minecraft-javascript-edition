// Disposable research arena. Does not create or migrate a playable save.
import {IDBFactory} from 'fake-indexeddb';
import {openCheckpointStore} from '../client/js/local-world/checkpoints.js';
import {DefaultTerrain189} from '../client/js/local-world/generation/v1_8_9/default.js';
import {StatefulPopulation189} from '../client/js/local-world/generation/v1_8_9/stateful-population.js';
import {partialPopulationSequence189} from '../client/js/local-world/generation/v1_8_9/population-sequence.js';
const generator=new DefaultTerrain189(7n),store=await openCheckpointStore('research-benchmark',new IDBFactory());
const biomeCache=new Map(),biomeAt=(x,z)=>{const key=`${x},${z}`;if(!biomeCache.has(key))biomeCache.set(key,generator.biomes.sample(x,z,1,1)[0]);return biomeCache.get(key);};
const bounds={minChunkX:13,maxChunkX:16,minChunkZ:-23,maxChunkZ:-20};
const engine=new StatefulPopulation189({worldId:'disposable-arena',generatorId:'research-only',stageId:'partial-v1',seed:7n,bounds,store,
 loadBase:async(x,z)=>{let c=await store.loadChunk('disposable-arena',x,z);if(!c)c=await store.saveChunk({...generator.carvedColumn(x,z),worldId:'disposable-arena',generatorId:'research-only',x,z});return c;},
 execute:partialPopulationSequence189({biomeAt,missing:'skip-experimental'})});
const before=performance.now();
try {
 const record=await engine.populate(14,-22);
 const bytes=record.columns.reduce((n,c)=>n+c.heightMap.byteLength+c.allocated.byteLength+c.biomes.byteLength+c.sections.reduce((s,v)=>s+v.blocks.byteLength+v.skyLight.byteLength+v.blockLight.byteLength,0),0);
 console.log(JSON.stringify({elapsedMs:performance.now()-before,journalBytes:bytes,columns:record.columns.length,unsupported:record.events.flatMap(e=>e.events).filter(e=>e.status==='unsupported').map(e=>e.stage),memory:process.memoryUsage()},null,2));
} finally {store.close();}
