// Bounded stateful generation research executor. Not a playable registration.
import {JavaRandom} from '../../java-random.js';
import {GenerationWorld189} from './generation-world.js';
import {BiomeDecoration189} from './biome-decoration.js';
import {BigOakTree189} from './trees.js';
import {populationSeed189} from './population-seed.js';

export const EXPERIMENTAL_DEFAULT_189 = Object.freeze({
  id:'java-1.8.9-default-experimental-stateful-v1', enabled:false,
  reason:'Native readiness/restart semantics and growing-world journal integration remain unverified'
});

const key=(x,z)=>`${x},${z}`;
export function snapshotDecorator189(decorator) {
  return {bigOaks:[...decorator.bigOaks].map(([id,t])=>[id,{heightLimit:t.heightLimit,leafDistanceLimit:t.leafDistanceLimit}]),giantKinds:[...decorator.giantKinds]};
}
function restoreDecorator(state) {
  const decorator=new BiomeDecoration189();
  if(state){for(const [id,t]of state.bigOaks)decorator.bigOaks.set(id,Object.assign(new BigOakTree189(),t));decorator.giantKinds=new Map(state.giantKinds);}
  return decorator;
}
function snapshotWorld(world) {
  return [...world.chunks.values()].map(c=>({x:c.x,z:c.z,allocated:c.allocated.slice(),heightMap:c.heightMap.slice(),biomes:c.biomes.slice(),
    sections:c.sections.map(s=>({blocks:s.blocks.slice(),skyLight:s.skyLight.slice(),blockLight:s.blockLight.slice()}))}));
}
function restoreWorld(world,columns) {
  for(const data of columns??[]){const c=world._chunk(data.x,data.z);c.allocated.set(data.allocated);c.heightMap.set(data.heightMap);c.biomes.set(data.biomes);
    data.sections.forEach((s,i)=>{c.sections[i].blocks.set(s.blocks);c.sections[i].skyLight.set(s.skyLight);c.sections[i].blockLight.set(s.blockLight);c.sections[i].recount();});}
}

export class StatefulPopulation189 {
  constructor({worldId,generatorId,stageId,seed,bounds,store,loadBase,execute}) {
    if(![worldId,generatorId,stageId].every(s=>typeof s==='string'&&s)||typeof execute!=='function'||typeof loadBase!=='function')throw new TypeError('Supply identity, base loader and synchronous executor');
    populationSeed189(seed,0,0);
    const {minChunkX,maxChunkX,minChunkZ,maxChunkZ}=bounds;
    if(![minChunkX,maxChunkX,minChunkZ,maxChunkZ].every(Number.isInteger)||minChunkX>maxChunkX||minChunkZ>maxChunkZ)throw new RangeError('Invalid research arena');
    if((maxChunkX-minChunkX+1)*(maxChunkZ-minChunkZ+1)>64)throw new RangeError('Research arena limited to 64 columns');
    Object.assign(this,{worldId,generatorId,stageId,seed,bounds:{minChunkX,maxChunkX,minChunkZ,maxChunkZ},store,loadBase,execute});this.tail=Promise.resolve();
  }
  async journal(){return this.store.loadPopulation(this.worldId,this.generatorId,this.stageId,0,0);}
  populate(x,z) {
    // Admission order is intentional, not coordinate sorting or order independence.
    const next=this.tail.then(()=>this.run(x,z));this.tail=next.catch(()=>{});return next;
  }
  validateConfiguration(record) {
    if(record&&(record.format!==1||record.seed!==this.seed.toString()||JSON.stringify(record.bounds)!==JSON.stringify(this.bounds)))throw new Error('Stateful generation configuration mismatch');
  }
  async context(record) {
    this.validateConfiguration(record);
    const bases=new Map();
    for(let x=this.bounds.minChunkX;x<=this.bounds.maxChunkX;x++)for(let z=this.bounds.minChunkZ;z<=this.bounds.maxChunkZ;z++)bases.set(key(x,z),await this.loadBase(x,z));
    const worldRandom=new JavaRandom(this.seed);if(record)worldRandom.seed=BigInt(record.worldRandom);
    const world=new GenerationWorld189({...this.bounds,random:worldRandom,loadColumn:(x,z)=>bases.get(key(x,z)).states});
    for(const [key,column]of bases){const [x,z]=key.split(',').map(Number);world._chunk(x,z).biomes.set(column.biomes);}
    restoreWorld(world,record?.columns);
    world.fluids.scheduled=structuredClone(record?.scheduled??[]);world.drops=structuredClone(record?.drops??[]);
    return {world,worldRandom,decorator:restoreDecorator(record?.decorator),bases};
  }
  async run(x,z) {
    populationSeed189(this.seed,x,z);
    if(x-1<this.bounds.minChunkX||x+2>this.bounds.maxChunkX||z-1<this.bounds.minChunkZ||z+2>this.bounds.maxChunkZ)throw new RangeError('Source requires a prepared four-by-four halo');
    const previous=await this.journal();
    this.validateConfiguration(previous);
    if(previous?.completed.some(p=>p[0]===x&&p[1]===z))return previous;
    const context=await this.context(previous),featureRandom=new JavaRandom(populationSeed189(this.seed,x,z)),events=[];
    const result=this.execute({...context,featureRandom,x,z,events});
    if(result&&typeof result.then==='function'){Promise.resolve(result).catch(()=>{});throw new TypeError('Population execution must be synchronous');}
    const record={format:1,worldId:this.worldId,generatorId:this.generatorId,stageId:this.stageId,seed:this.seed.toString(),bounds:this.bounds,
      completed:[...(previous?.completed??[]),[x,z]],columns:snapshotWorld(context.world),decorator:snapshotDecorator189(context.decorator),
      worldRandom:context.worldRandom.seed.toString(),scheduled:structuredClone(context.world.fluids.scheduled),drops:structuredClone(context.world.drops),
      events:[...(previous?.events??[]),{x,z,events,featureRandom:featureRandom.seed.toString()}]};
    return this.store.commitStatefulPopulation(record,previous?.revision??0);
  }
}

// Isolated native chunk-load admission model. Callers must prepare a larger
// read halo before executing the returned sources; this class performs no I/O.
export class PopulationReadiness189 {
  constructor(){this.prepared=new Set();this.admitted=new Set();}
  preparedChunk(x,z) {
    if(![x,z].every(Number.isInteger))throw new TypeError('Integer chunk coordinates required');
    this.prepared.add(key(x,z));const ready=[];
    for(const [cx,cz]of [[x,z],[x-1,z],[x,z-1],[x-1,z-1]]){
      const source=key(cx,cz);
      if(!this.admitted.has(source)&&[[cx,cz],[cx+1,cz],[cx,cz+1],[cx+1,cz+1]].every(([px,pz])=>this.prepared.has(key(px,pz)))){
        this.admitted.add(source);ready.push([cx,cz]);
      }
    }
    return ready;
  }
}
