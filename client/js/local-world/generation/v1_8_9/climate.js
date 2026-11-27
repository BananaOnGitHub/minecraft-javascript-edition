// Independently computed world queries for the 1.8.9 freeze/snow pass.
import {JavaRandom} from '../../java-random.js';
import {SimplexNoise189} from './noise.js';
import {fluidKind189} from './fluids.js';

// Numeric base temperatures observed for the 1.8.9 biome registry.
const biomeTemperatures=new Map([
  [0,0.5],[1,0.800000011920929],[2,2],[3,0.20000000298023224],[4,0.699999988079071],[5,0.25],
  [6,0.800000011920929],[7,0.5],[8,2],[9,0.5],[10,0],[11,0],
  [12,0],[13,0],[14,0.8999999761581421],[15,0.8999999761581421],[16,0.800000011920929],[17,2],
  [18,0.699999988079071],[19,0.25],[20,0.20000000298023224],[21,0.949999988079071],[22,0.949999988079071],[23,0.949999988079071],
  [24,0.5],[25,0.20000000298023224],[26,0.05000000074505806],[27,0.6000000238418579],[28,0.6000000238418579],[29,0.699999988079071],
  [30,-0.5],[31,-0.5],[32,0.30000001192092896],[33,0.30000001192092896],[34,0.20000000298023224],[35,1.2000000476837158],
  [36,1],[37,2],[38,2],[39,2],[129,0.800000011920929],[130,2],
  [131,0.20000000298023224],[132,0.699999988079071],[133,0.25],[134,0.800000011920929],[140,0],[149,0.949999988079071],
  [151,0.949999988079071],[155,0.6000000238418579],[156,0.6000000238418579],[157,0.699999988079071],[158,-0.5],[160,0.25],
  [161,0.25],[162,0.20000000298023224],[163,1.100000023841858],[164,1],[165,2],[166,2],
  [167,2],
]);
export function biomeBaseTemperature189(id) {
  if(!biomeTemperatures.has(id))throw new RangeError(`Unknown 1.8.9 biome ID ${id}`);
  return biomeTemperatures.get(id);
}

const temperatureNoise=new SimplexNoise189(new JavaRandom(1234n));
const f=Math.fround;
export function temperature189(baseTemperature,x,y,z) {
  const base=f(baseTemperature);
  if(y<=64)return base;
  const variation=f(temperatureNoise.sample(x/8,z/8)*4);
  const altitude=f(f(variation+f(y))-64);
  return f(base-f(f(altitude*f(0.05))/30));
}
export function precipitationHeight189(world,x,z) {
  for(let y=255;y>=0;y--){const s=world.get(x,y,z);if(world.blocksMovement(s)||fluidKind189(s))return y+1;}
  return 0;
}
export function canFreeze189(world,x,y,z,baseTemperature,edgeOnly=false) {
  if(y<0||y>=256||temperature189(baseTemperature,x,y,z)>=f(0.15)||world.getBlockLight(x,y,z)>=10)return false;
  const state=world.get(x,y,z);
  if(fluidKind189(state)!=='water'||(state&15)!==0)return false;
  return !edgeOnly||[[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dz])=>fluidKind189(world.get(x+dx,y,z+dz))!=='water');
}
export function canSnow189(world,x,y,z,baseTemperature,checkPlacement=true) {
  if(temperature189(baseTemperature,x,y,z)>=f(0.15))return false;
  if(!checkPlacement)return true;
  if(y<0||y>=256||world.getBlockLight(x,y,z)>=10||world.get(x,y,z)!==0)return false;
  const below=world.get(x,y-1,z),id=below>>4;
  return id===18||id===161||(id===78&&(below&15)===7)||(world.isOpaque(below)&&world.blocksMovement(below));
}

// Chunk coordinates designate the source chunk; the native pass is offset by
// eight blocks and therefore accesses up to four chunks synchronously.
export function freezeAndSnow189(world,chunkX,chunkZ,baseTemperatureAt) {
  if(typeof baseTemperatureAt!=='function')throw new TypeError('Supply biome base temperatures');
  const startX=chunkX*16+8,startZ=chunkZ*16+8;
  for(let x=startX;x<startX+16;x++)for(let z=startZ;z<startZ+16;z++) {
    const y=precipitationHeight189(world,x,z);
    if(canFreeze189(world,x,y-1,z,baseTemperatureAt(x,y-1,z)))world.set(x,y-1,z,79<<4);
    if(canSnow189(world,x,y,z,baseTemperatureAt(x,y,z),true))world.set(x,y,z,78<<4);
  }
}
