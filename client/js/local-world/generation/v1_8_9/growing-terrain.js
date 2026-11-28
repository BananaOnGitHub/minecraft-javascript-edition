// Protocol-facing adapter, intentionally not registered for world creation yet.
import {PersistedTerrain} from '../../persisted-terrain.js';
import {GrowingPopulation189} from './growing-population.js';

export class GrowingTerrain189 extends PersistedTerrain {
  constructor(generator,state,store,execute) {
    if(generator.population)throw new Error('Stateful terrain cannot use the immutable population planner');
    super(generator,state,store);this.baseCache=new Map();this.changed=new Map();this.invalidated=new Map();this.preparing=Promise.resolve();
    this.population=new GrowingPopulation189({worldId:this.worldId,generatorId:this.generatorId,stageId:'growing-partial-v1',seed:BigInt(state.seed),store,execute,
      loadBase:async(x,z)=>{
        const key=`${x},${z}`;let c=this.baseCache.get(key);
        if(!c)c=await super.readStoredColumn(x,z);
        this.baseCache.delete(key);this.baseCache.set(key,c);if(this.baseCache.size>64)this.baseCache.delete(this.baseCache.keys().next().value);return c;
      },onCommit:({columns})=>{for(const c of columns){const key=`${c.x},${c.z}`;if(this.cache.has(key))this.invalidated.set(key,c);}}});
  }
  prepare(x,z) {
    const next=this.preparing.then(async()=>{
      const column=await this.population.prepare(x,z);
      for(const [key,c]of this.invalidated){
        this.cache.set(key,await this.population.read(c.x,c.z));this.changed.set(key,c);
      }
      this.invalidated.clear();const key=`${x},${z}`;this.cache.delete(key);this.cache.set(key,column);
      if(this.cache.size>384)this.cache.delete(this.cache.keys().next().value);
    });
    this.preparing=next.catch(()=>{});return next;
  }
  takeChangedColumns(){const changes=[...this.changed.values()];this.changed.clear();return changes;}
  get cachedBytes(){return super.cachedBytes+[...this.baseCache.values()].reduce((n,c)=>n+c.states.byteLength+c.biomes.byteLength,0);}
}
