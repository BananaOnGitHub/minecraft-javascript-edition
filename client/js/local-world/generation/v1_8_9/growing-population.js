// Expanding, chunk-addressable generation. All execution is private until CAS.
import {JavaRandom} from '../../java-random.js';
import {GenerationWorld189} from './generation-world.js';
import {populationSeed189} from './population-seed.js';
import {restoreDecorator,snapshotDecorator189,snapshotWorld,restoreWorld} from './stateful-population.js';
const key=(x,z)=>`${x},${z}`;
const sameArray=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
function sameColumn(a,b) {
  return sameArray(a.allocated,b.allocated)&&sameArray(a.heightMap,b.heightMap)&&sameArray(a.biomes,b.biomes)&&a.sections.every((s,i)=>
    ['blocks','skyLight','blockLight'].every(k=>sameArray(s[k],b.sections[i][k])));
}
export class GrowingPopulation189 {
  constructor({worldId,generatorId,stageId,seed,store,loadBase,execute,onCommit=()=>{}}) {
    populationSeed189(seed,0,0);
    if(![worldId,generatorId,stageId].every(v=>typeof v==='string'&&v)||typeof loadBase!=='function'||typeof execute!=='function')throw new TypeError('Growing population requires identity and callbacks');
    Object.assign(this,{worldId,generatorId,stageId,seed,store,loadBase,execute,onCommit});
    this.identity=[worldId,generatorId,stageId];this.tail=Promise.resolve();this.executing=null;
    this.metrics={operations:0,populations:0,columnsWritten:0,peakResidentColumns:0,populationMs:0};
  }
  check(meta){if(meta&&(meta.format!==2||meta.seed!==this.seed.toString()))throw new Error('Growing generation configuration mismatch');}
  emptyMeta(){return {format:2,worldId:this.worldId,generatorId:this.generatorId,stageId:this.stageId,seed:this.seed.toString(),revision:0,sequence:0,pending:[],worldRandom:new JavaRandom(this.seed).seed.toString(),decorator:null};}
  columnRecord(x,z){return {worldId:this.worldId,generatorId:this.generatorId,stageId:this.stageId,x,z,admissionReady:false,population:'unadmitted',scheduled:[],drops:[]};}
  prepare(x,z) {
    populationSeed189(this.seed,x,z);
    const next=this.tail.then(async()=>{await this.drain();await this.admit(x,z);await this.drain();return this.read(x,z);});
    this.tail=next.catch(()=>{});return next;
  }
  async commit(meta,columns,revision) {
    const committed=await this.store.commitGenerationWindow(meta,columns,revision);
    this.metrics.operations++;this.metrics.columnsWritten+=columns.length;
    // Notification is after durability. A delivery error cannot roll back a save.
    try{this.onCommit({revision:committed.revision,columns:columns.map(c=>({x:c.x,z:c.z}))});}catch(error){this.notificationError=error;}
    return committed;
  }
  async retry(run) {
    for(let attempt=0;;attempt++)try{return await run();}catch(e){if(!/Growing population revision conflict/.test(e.message)||attempt>=3)throw e;}
  }
  async admit(x,z) {
    // Explicit terrain admission only. Halo preparation below never calls admit.
    await this.loadBase(x,z);
    return this.retry(async()=>{
      const coords=[];for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)coords.push([x+dx,z+dz]);
      const {meta:stored,columns}=await this.store.loadGenerationWindow(this.identity,coords);this.check(stored);
      const meta=stored??this.emptyMeta(),map=new Map(columns.map(c=>[key(c.x,c.z),c])),changed=new Map();
      let current=map.get(key(x,z))??this.columnRecord(x,z);
      if(current.admissionReady)return;
      current={...current,admissionReady:true};map.set(key(x,z),current);changed.set(key(x,z),current);
      for(const [cx,cz]of [[x,z],[x-1,z],[x,z-1],[x-1,z-1]]){
        let source=map.get(key(cx,cz));
        if(source?.population==='unadmitted'&&[[cx,cz],[cx+1,cz],[cx,cz+1],[cx+1,cz+1]].every(([px,pz])=>map.get(key(px,pz))?.admissionReady)){
          source={...source,population:'pending'};map.set(key(cx,cz),source);changed.set(key(cx,cz),source);meta.pending.push([cx,cz]);
        }
      }
      await this.commit(meta,[...changed.values()],meta.revision);
    });
  }
  async drain() {
    for(;;){const {meta}=await this.store.loadGenerationWindow(this.identity,[]);this.check(meta);if(!meta?.pending.length)return;
      const [x,z]=meta.pending[0];this.executing=[x,z];try{await this.retry(()=>this.populatePending(x,z));}finally{this.executing=null;}}
  }
  async populatePending(x,z) {
    const coordinates=[];for(let cx=x-1;cx<=x+2;cx++)for(let cz=z-1;cz<=z+2;cz++)coordinates.push([cx,cz]);
    const bases=new Map();for(const [cx,cz]of coordinates)bases.set(key(cx,cz),await this.loadBase(cx,cz));
    const {meta,columns}=await this.store.loadGenerationWindow(this.identity,coordinates);this.check(meta);
    if(!meta?.pending.length||meta.pending[0][0]!==x||meta.pending[0][1]!==z)return;
    const saved=new Map(columns.map(c=>[key(c.x,c.z),c]));
    const random=new JavaRandom(this.seed);random.seed=BigInt(meta.worldRandom);
    const world=new GenerationWorld189({random,minChunkX:x-1,maxChunkX:x+2,minChunkZ:z-1,maxChunkZ:z+2,loadColumn:(cx,cz)=>bases.get(key(cx,cz)).states});
    for(const [cx,cz]of coordinates)world._chunk(cx,cz).biomes.set(bases.get(key(cx,cz)).biomes);
    restoreWorld(world,columns.filter(c=>c.generated).map(c=>c.generated));
    for(const c of columns){world.fluids.scheduled.push(...c.scheduled);world.drops.push(...c.drops);}
    const before=new Map(snapshotWorld(world).map(c=>[key(c.x,c.z),c]));
    const decorator=restoreDecorator(meta.decorator),events=[],featureRandom=new JavaRandom(populationSeed189(this.seed,x,z)),started=performance.now();
    const result=this.execute({world,worldRandom:random,featureRandom,decorator,x,z,events});
    if(result&&typeof result.then==='function'){Promise.resolve(result).catch(()=>{});throw new TypeError('Population execution must be synchronous');}
    this.metrics.populationMs+=performance.now()-started;
    const group=items=>{const map=new Map();for(const item of items){const k=key(item.x>>4,item.z>>4);if(!before.has(k))throw new Error('Deferred effect outside prepared halo');if(!map.has(k))map.set(k,[]);map.get(k).push(item);}return map;};
    const scheduled=group(world.fluids.scheduled),drops=group(world.drops),writes=[];
    for(const generated of snapshotWorld(world)){
      const k=key(generated.x,generated.z),old=saved.get(k)??this.columnRecord(generated.x,generated.z),nextScheduled=scheduled.get(k)??[],nextDrops=drops.get(k)??[];
      const source=generated.x===x&&generated.z===z;
      if(source||!sameColumn(before.get(k),generated)||JSON.stringify(old.scheduled)!==JSON.stringify(nextScheduled)||JSON.stringify(old.drops)!==JSON.stringify(nextDrops))
        writes.push({...old,generated,population:source?'completed':old.population,completedSequence:source?meta.sequence+1:old.completedSequence,scheduled:nextScheduled,drops:nextDrops});
    }
    const next={...meta,sequence:meta.sequence+1,pending:meta.pending.slice(1),worldRandom:random.seed.toString(),decorator:snapshotDecorator189(decorator),lastOperation:{x,z,events,featureRandom:featureRandom.seed.toString()}};
    await this.commit(next,writes,meta.revision);this.metrics.populations++;this.metrics.peakResidentColumns=Math.max(this.metrics.peakResidentColumns,16);
  }
  async read(x,z) {
    const {meta,columns}=await this.store.loadGenerationWindow(this.identity,[[x,z]]);this.check(meta);
    const stored=columns[0],base=await this.loadBase(x,z);
    if(!stored?.generated)return {...base,revision:stored?.revision??0};
    const states=new Uint16Array(65536),skyLight=new Uint8Array(32768),blockLight=new Uint8Array(32768);
    let lastSection=0;
    stored.generated.sections.forEach((s,i)=>{
      states.set(s.blocks,i*4096);skyLight.set(s.skyLight,i*2048);blockLight.set(s.blockLight,i*2048);
      if(stored.generated.allocated?.[i]||s.blocks.some(v=>v!==0)||s.blockLight.some(v=>v!==0)||s.skyLight.some(v=>v!==0xff))lastSection=i;
    });
    return {states,biomes:stored.generated.biomes,skyLight,blockLight,lastSection,revision:stored.revision,population:stored.population};
  }
}
