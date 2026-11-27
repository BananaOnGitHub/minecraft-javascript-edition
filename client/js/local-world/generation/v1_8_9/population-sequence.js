// Experimental partial sequence. Missing stages are explicit RNG boundaries;
// this is not a native population-parity claim or playable registration.
import {generateLake189} from './lakes.js';
import {biomeBaseTemperature189,canFreeze189,freezeAndSnow189} from './climate.js';

export function partialPopulationSequence189({biomeAt,missing='reject',structures,dungeons,animals,observe=()=>{}}) {
  if(typeof biomeAt!=='function'||!['reject','skip-experimental'].includes(missing))throw new TypeError('Supply biomes and an explicit unsupported-stage policy');
  return ({world,featureRandom:r,worldRandom,decorator,x,z,events})=>{
    const emit=event=>{events.push(event);observe(event);};
    const boundary=(name,hook,args)=>{
      emit({stage:name,status:hook?'provided':'unsupported',featureRandom:r.seed.toString(),worldRandom:worldRandom.seed.toString()});
      if(hook)return hook(args);
      if(missing==='reject')throw new Error(`Unsupported population stage: ${name}`);
      return false;
    };
    const bx=x*16,bz=z*16,biome=biomeAt(bx+16,bz+16);
    const village=boundary('structures',structures,{world,random:r,x,z});
    const lakeOptions={canFreezeWater:(px,py,pz)=>canFreeze189(world,px,py,pz,biomeBaseTemperature189(biomeAt(px,pz))),
      topBlock:(px,py,pz)=>[14,15].includes(biomeAt(px,pz))?1760:32};
    if(![2,17].includes(biome)&&!village&&r.nextInt(4)===0){
      const px=bx+r.nextInt(16)+8,py=r.nextInt(256),pz=bz+r.nextInt(16)+8;
      emit({stage:'water-lake',x:px,y:py,z:pz,result:generateLake189(world,r,px,py,pz,'water',lakeOptions)});
    }
    if(!village&&r.nextInt(8)===0){
      const px=bx+r.nextInt(16)+8,py=r.nextInt(r.nextInt(248)+8),pz=bz+r.nextInt(16)+8;
      if(py<63||r.nextInt(10)===0)emit({stage:'lava-lake',x:px,y:py,z:pz,result:generateLake189(world,r,px,py,pz,'lava',lakeOptions)});
    }
    // Missing dungeon generation is deliberately not approximated by skipping
    // a fixed number of draws. Its rejection paths consume variable RNG.
    for(let attempt=0;attempt<8;attempt++){
      const px=bx+r.nextInt(16)+8,py=r.nextInt(256),pz=bz+r.nextInt(16)+8;
      boundary('dungeon',dungeons,{world,random:r,x:px,y:py,z:pz,attempt});
    }
    emit({stage:'decoration',biome,x:bx,z:bz});
    decorator.decorate(world,r,biome,bx,bz,{fluids:world.fluids});
    boundary('animals',animals,{world,random:r,x:bx+8,z:bz+8,biome});
    emit({stage:'freeze-snow'});
    freezeAndSnow189(world,x,z,(px,py,pz)=>biomeBaseTemperature189(biomeAt(px,pz)));
  };
}
