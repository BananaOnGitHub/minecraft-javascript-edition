// Protocol-facing adapter backed by durable incremental generation.
import {PersistedTerrain} from '../../persisted-terrain.js';
import {World} from '../../../world/world.js';
import {Chunk,Section} from '../../../world/chunk.js';
import {BLOCK_PROPERTIES_189} from './block-properties.js';
import {GrowingPopulation189} from './growing-population.js';

class WorkerRelightWorld extends World {
  opacity(s){return BLOCK_PROPERTIES_189[s>>4]?.[1]??255;}
  _sourceLevel(sky,x,y,z){
    const st=this.getState(x,y,z);
    if(!sky)return BLOCK_PROPERTIES_189[st>>4]?.[2]??0;
    if(this.opacity(st)>0)return 0;
    const c=this._chunk(x>>4,z>>4);
    return c&&y>=c.heightMap[((z&15)<<4)|(x&15)]?15:0;
  }
  _applyChanges(changes){
    const dirty=new Set(),blockSeeds=[],skySeeds=[];
    for(const [x,y,z,old,state]of changes){
      this._markBlock(dirty,x,y,z,true);
      const emitOld=BLOCK_PROPERTIES_189[old>>4]?.[2]??0,emitNew=BLOCK_PROPERTIES_189[state>>4]?.[2]??0;
      const opChanged=this.opacity(old)!==this.opacity(state);
      if(emitOld!==emitNew||opChanged)blockSeeds.push(x,y,z);
      if(this.hasSky&&opChanged)skySeeds.push(x,y,z);
    }
    if(blockSeeds.length)this._relight(false,blockSeeds,dirty);
    if(skySeeds.length)this._relight(true,skySeeds,dirty);
  }
}

function relightEditedColumn(cx,cz,base,changes,cache,edits) {
  const world=new WorkerRelightWorld();
  const loadFrom=(kx,kz,col,neighborChanges)=>{
    const c=new Chunk(kx,kz,true);
    for(let sy=0;sy<16;sy++){
      const s=new Section(true);
      s.blocks.set(col.states.subarray(sy*4096,(sy+1)*4096));
      s.skyLight.set(col.skyLight.subarray(sy*2048,(sy+1)*2048));
      s.blockLight.set(col.blockLight.subarray(sy*2048,(sy+1)*2048));
      s.recount();
      c.sections[sy]=s;
    }
    if(neighborChanges)for(const [idx,st]of neighborChanges)c.setState(idx&15,idx>>8,(idx>>4)&15,st);
    c.biomes.set(col.biomes);
    world._computeHeights(c);
    world.chunks.set(`${kx},${kz}`,c);
    return c;
  };
  const center=loadFrom(cx,cz,base);
  for(const [dx,dz]of [[-1,0],[1,0],[0,-1],[0,1]]){
    const nk=`${cx+dx},${cz+dz}`,neighbor=cache.get(nk);
    if(neighbor?.skyLight&&neighbor?.blockLight)loadFrom(cx+dx,cz+dz,neighbor,edits.get(nk));
  }
  world.beginBatch();
  for(const [index,state]of changes)world.setState(cx*16+(index&15),index>>8,cz*16+((index>>4)&15),state);
  world.endBatch();
  const states=new Uint16Array(65536),skyLight=new Uint8Array(32768),blockLight=new Uint8Array(32768);
  let lastSection=base.lastSection??0;
  for(let sy=0;sy<16;sy++){
    const s=center.sections[sy];if(!s)continue;
    states.set(s.blocks,sy*4096);skyLight.set(s.skyLight,sy*2048);blockLight.set(s.blockLight,sy*2048);
    if(sy>lastSection&&(s.nonAir||s.blockLight.some(v=>v!==0)||s.skyLight.some(v=>v!==0xff)))lastSection=sy;
  }
  return {states,biomes:base.biomes,skyLight,blockLight,lastSection};
}

export class GrowingTerrain189 extends PersistedTerrain {
  constructor(generator,state,store,execute) {
    if(generator.population)throw new Error('Stateful terrain cannot use the immutable population planner');
    super(generator,state,store);this.baseCache=new Map();this.changed=new Map();this.invalidated=new Map();this.preparing=Promise.resolve();
    this.population=new GrowingPopulation189({worldId:this.worldId,generatorId:this.generatorId,stageId:'growing-partial-v1',seed:BigInt(state.seed),store,execute,
      loadBase:async(x,z)=>{
        const key=`${x},${z}`;let c=this.baseCache.get(key);
        if(!c){c=await super.readStoredColumn(x,z);generator.seedBiomes?.(x,z,c.biomes);}
        this.baseCache.delete(key);this.baseCache.set(key,c);if(this.baseCache.size>64)this.baseCache.delete(this.baseCache.keys().next().value);return c;
      },onCommit:({columns})=>{for(const c of columns){const key=`${c.x},${c.z}`;if(this.cache.has(key))this.invalidated.set(key,c);}}});
  }
  prepare(x,z) {
    const next=this.preparing.then(async()=>{
      const key=`${x},${z}`;
      const cached=this.cache.get(key);
      if(cached&&!this.invalidated.size){this.cache.delete(key);this.cache.set(key,cached);return;}
      const column=await this.population.prepare(x,z);
      for(const [k,c]of this.invalidated){
        this.cache.delete(k);this.cache.set(k,await this.population.read(c.x,c.z));this.changed.set(k,c);
      }
      this.invalidated.clear();this.cache.delete(key);this.cache.set(key,column);
      while(this.cache.size>384)this.cache.delete(this.cache.keys().next().value);
    });
    this.preparing=next.catch(()=>{});return next;
  }
  column(x,z) {
    const base=this.baseColumn(x,z);
    const changes=this.edits.get(`${x},${z}`);
    if(!changes)return base;
    if(!base.skyLight||!base.blockLight)return super.column(x,z);
    return relightEditedColumn(x,z,base,changes,this.cache,this.edits);
  }
  takeChangedColumns(){const changes=[...this.changed.values()];this.changed.clear();return changes;}
  get cachedBytes(){return super.cachedBytes+[...this.baseCache.values()].reduce((n,c)=>n+c.states.byteLength+c.biomes.byteLength,0);}
}
