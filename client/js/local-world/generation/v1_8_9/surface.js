// Legacy surfaces, derived from Glowstone's MIT ground generators and validated
// against black-box vanilla stage fixtures. See docs/default-generation.md.
import { JavaRandom } from '../../java-random.js';
import { SimplexOctaves189 } from './noise.js';
import { MesaSurface189 } from './mesa.js';
const grassNoise=new SimplexOctaves189(new JavaRandom(2345n),1);
const point = (noise,x,z) => {
  let value=0,frequency=1;
  for(const octave of noise.octaves) {value+=octave.sample(x*frequency,z*frequency)/frequency;frequency/=2;}
  return value;
};
const cold = id => [10,11,12,13,26,30,31,140,158].includes(id);
function materials(id,noise) {
  if(id===140)return [1280,48];
  if([2,17,130,16,26].includes(id)) return [192,192];
  if(id===25) return [16,16];
  if(id===14||id===15) return [1760,48];
  if([3,34,131,162].includes(id)) {
    if((noise < -1 || noise > 2) && (id===131||id===162)) return [208,208];
    if(noise>1 && id!==34) return [16,16];
  }
  if([32,33,160,161].includes(id)) {
    if(noise>1.75)return [49,48];
    if(noise>-.95)return [50,48];
  }
  if(id===163||id===164) {
    if(noise>1.75)return [16,16];
    if(noise>-.5)return [49,48];
  }
  return [32,48];
}

export function replaceSurfaces189(generator,cx,cz,column) {
  const {states,biomes}=column;
  column.surfaceTops=new Map();
  const random=new JavaRandom(BigInt.asIntN(64,BigInt(cx)*341873128712n+BigInt(cz)*132897987541n));
  const noise=generator.surface.sample(cx*16,cz*16,16,16,.0625,.0625,1);
  for(let z=0;z<16;z++)for(let x=0;x<16;x++) {
    // The legacy provider passes transposed local coordinates to biome surface
    // callbacks; the generic callback transposes primer access back again.
    const index=z*16+x,id=biomes[index],value=noise[index],wx=cx*16+z,wz=cz*16+x;
    if([37,38,39,165,166,167].includes(id)) {
      generator.mesa??=new MesaSurface189(generator.seed);
      generator.mesa.replace(states,index,id,value,random,wx,wz);
      continue;
    }
    if(id===6||id===134) {
      const swamp=point(grassNoise,wx*.25,wz*.25);
      if(swamp>0) {
        let y=255;while(y>=0 && states[y*256+index]===0)y--;
        if(y===62 && states[y*256+index]!==144) {
          states[y*256+index]=144;
          if(swamp<.12) states[63*256+index]=1776;
        }
      }
    }
    const [initialTop,initialFiller]=materials(id,value);
    column.surfaceTops.set(id,initialTop);
    let top=initialTop,filler=initialFiller,remaining=-1;
    const depth=Math.trunc(value/3+3+random.nextDouble()*.25);
    for(let y=255;y>=0;y--) {
      const offset=y*256+index;
      if(y<=random.nextInt(5)) {states[offset]=112;continue;}
      const state=states[offset];
      if(state===0)remaining=-1;
      else if(state===16) {
        if(remaining===-1) {
          if(depth<=0) {top=0;filler=16;}
          else if(y>=59 && y<=64) {top=initialTop;filler=initialFiller;}
          if(y<63 && top===0)top=cold(id)?1264:144;
          remaining=depth;
          if(y>=62)states[offset]=top;
          else if(y<56-depth) {top=0;filler=16;states[offset]=208;}
          else states[offset]=filler;
        } else if(remaining>0) {
          remaining--;states[offset]=filler;
          if(remaining===0 && (filler>>4)===12) {
            remaining=random.nextInt(4)+Math.max(0,y-63);
            filler=(filler&15)===1?2864:384;
          }
        }
      }
    }
  }
  return column;
}
