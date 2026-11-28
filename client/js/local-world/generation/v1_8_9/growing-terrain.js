// Protocol-facing adapter backed by durable incremental generation.
import {PersistedTerrain} from '../../persisted-terrain.js';
import {GrowingPopulation189} from './growing-population.js';
import {gameplayLight189} from './gameplay-light.js';

export class GrowingTerrain189 extends PersistedTerrain {
  constructor(generator,state,store,execute) {
    if(generator.population)throw new Error('Stateful terrain cannot use the immutable population planner');
    super(generator,state,store);this.baseCache=new Map();this.changed=new Map();this.invalidated=new Map();this.preparing=Promise.resolve();
    this.lightInputs=new Map();this.gameplay=new Map();this.lightingMetrics={passes:0,totalMs:0,peakMs:0};
    this.population=new GrowingPopulation189({worldId:this.worldId,generatorId:this.generatorId,stageId:'growing-partial-v1',seed:BigInt(state.seed),store,execute,
      loadBase:async(x,z)=>{
        const key=`${x},${z}`;let c=this.baseCache.get(key);
        if(!c){c=await super.readStoredColumn(x,z);generator.seedBiomes?.(x,z,c.biomes);}
        this.baseCache.delete(key);this.baseCache.set(key,c);if(this.baseCache.size>64)this.baseCache.delete(this.baseCache.keys().next().value);return c;
      },onCommit:({columns})=>{for(const c of columns){
        this.lightInputs.delete(`${c.x},${c.z}`);
        // Diffuse light can cross a chunk border even when no block in the
        // transmitted neighbor changed. Halo reads never admit population.
        for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
          const x=c.x+dx,z=c.z+dz,key=`${x},${z}`;
          if(this.cache.has(key))this.invalidated.set(key,{x,z});
        }
      }}});
  }
  async lightingInputs(x,z) {
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      const cx=x+dx,cz=z+dz,key=`${cx},${cz}`;
      let c=this.lightInputs.get(key);
      if(!c)c=await this.population.read(cx,cz);
      this.lightInputs.delete(key);this.lightInputs.set(key,c);
      while(this.lightInputs.size>64)this.lightInputs.delete(this.lightInputs.keys().next().value);
    }
  }
  deriveLighting(x,z) {
    const start=performance.now();
    const column=gameplayLight189(x,z,(cx,cz)=>this.lightInputs.get(`${cx},${cz}`),this.edits);
    const elapsed=performance.now()-start;this.lightingMetrics.passes++;
    this.lightingMetrics.totalMs+=elapsed;this.lightingMetrics.peakMs=Math.max(this.lightingMetrics.peakMs,elapsed);
    this.gameplay.set(`${x},${z}`,column);return column;
  }
  async refreshInvalidated() {
    for(const [key,c]of this.invalidated){
      this.cache.delete(key);this.cache.set(key,await this.population.read(c.x,c.z));
      await this.lightingInputs(c.x,c.z);this.deriveLighting(c.x,c.z);
      this.changed.set(key,c);
    }
    this.invalidated.clear();
  }
  prepare(x,z) {
    const next=this.preparing.then(async()=>{
      const key=`${x},${z}`;
      if(!this.cache.has(key)||this.invalidated.size){
        const column=await this.population.prepare(x,z);
        await this.refreshInvalidated();
        this.cache.delete(key);this.cache.set(key,column);
      }
      // Prepare a read-only state halo even on cache hits, so subsequent edits
      // can synchronously derive correct border light. No admission occurs.
      await this.lightingInputs(x,z);
      if(!this.gameplay.has(key))this.deriveLighting(x,z);
      while(this.cache.size>384){const old=this.cache.keys().next().value;this.cache.delete(old);this.gameplay.delete(old);}
    });
    this.preparing=next.catch(()=>{});return next;
  }
  column(x,z) {
    this.baseColumn(x,z);
    const key=`${x},${z}`;
    // set() is synchronous; its caller prepared this halo before editing.
    if(this.invalidated.has(key))return this.deriveLighting(x,z);
    const column=this.gameplay.get(key);
    if(!column)throw new Error('Gameplay lighting must be prepared before reading.');
    return column;
  }
  set(x,y,z,state) {
    super.set(x,y,z,state);
    const cx=x>>4,cz=z>>4;
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      const px=cx+dx,pz=cz+dz,key=`${px},${pz}`;
      if(this.cache.has(key))this.invalidated.set(key,{x:px,z:pz});
    }
  }
  flushLighting() {
    const next=this.preparing.then(()=>this.refreshInvalidated());
    this.preparing=next.catch(()=>{});return next;
  }
  takeChangedColumns(){const changes=[...this.changed.values()];this.changed.clear();return changes;}
  get cachedBytes(){
    const arrays=new Set();
    for(const c of [...this.cache.values(),...this.baseCache.values(),...this.lightInputs.values(),...this.gameplay.values()])
      for(const k of ['states','biomes','skyLight','blockLight'])if(c[k])arrays.add(c[k]);
    return [...arrays].reduce((n,a)=>n+a.byteLength,0);
  }
}
