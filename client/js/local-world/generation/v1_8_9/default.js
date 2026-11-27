// Terrain blending/interpolation derived from Glowstone's MIT implementation.
// Java float rounding and sampler construction order are verified separately
// against the local unmodified 1.8.9 server. See docs/default-generation.md.
import { JavaRandom } from '../../java-random.js';
import { Biomes189, GENERATOR_ID } from './biomes.js';
import { PerlinOctaves189, SimplexOctaves189 } from './noise.js';
import { replaceSurfaces189 } from './surface.js';
import { carveCaves189, carveRavines189 } from './carvers.js';

const f = Math.fround;
// Legacy biome root height and variation, verified against runtime registry
// values. These are numerical configuration, not game implementation code.
const parameters = [[0,-1,.1],[1,.125,.05],[2,.125,.05],[3,1,.5],[4,.1,.2],[5,.2,.2],
  [6,-.2,.1],[7,-.5,0],[8,.1,.2],[9,.1,.2],[10,-1,.1],[11,-.5,0],[12,.125,.05],
  [13,.45,.3],[14,.2,.3],[15,0,.025],[16,0,.025],[17,.45,.3],[18,.45,.3],[19,.45,.3],
  [20,.8,.3],[21,.1,.2],[22,.45,.3],[23,.1,.2],[24,-1.8,.1],[25,.1,.8],[26,0,.025],
  [27,.1,.2],[28,.45,.3],[29,.1,.2],[30,.2,.2],[31,.45,.3],[32,.2,.2],[33,.45,.3],
  [34,1,.5],[35,.125,.05],[36,1.5,.025],[37,.1,.2],[38,1.5,.025],[39,1.5,.025],
  [129,.125,.05],[130,.225,.25],[131,1,.5],[132,.1,.4],[133,.3,.4],[134,-.1,.3],
  [140,.425,.45000002],[149,.2,.4],[151,.2,.4],[155,.2,.4],[156,.55,.5],[157,.2,.4],
  [158,.3,.4],[160,.2,.2],[161,.2,.2],[162,1,.5],[163,.3625,1.225],[164,1.05,1.2125001],
  [165,.1,.2],[166,.45,.3],[167,.45,.3]];
export const BIOME_HEIGHTS = new Map(parameters.map(([id,h,v]) => [id,[f(h),f(v)]]));
const weights = new Float32Array(25);
for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)weights[x+2+(z+2)*5]=f(10/f(Math.sqrt(f(x*x+z*z+f(.2)))));
const clampLerp = (t,a,b) => t<0?a:t>1?b:a+(b-a)*t;

/** Stage API intentionally does not expose a playable column() until the
 * supported generation contract includes population. Old saves are untouched.
 */
export class DefaultTerrain189 {
  static id = GENERATOR_ID;
  constructor(seed) {
    this.biomes=new Biomes189(seed);
    this.seed=this.biomes.seed;
    const random=new JavaRandom(this.seed);
    this.lower=new PerlinOctaves189(random,16);
    this.upper=new PerlinOctaves189(random,16);
    this.main=new PerlinOctaves189(random,8);
    this.surface=new SimplexOctaves189(random,4);
    // Both unused samplers still consume the vanilla constructor RNG sequence.
    this.scale=new PerlinOctaves189(random,10);
    this.depth=new PerlinOctaves189(random,16);
    this.forest=new PerlinOctaves189(random,8);
  }
  density(cx,cz) {
    if(!Number.isInteger(cx)||!Number.isInteger(cz)||cx < -1875000||cx >= 1875000||cz < -1875000||cz >= 1875000) throw new RangeError('Chunk coordinates outside supported world bounds');
    const x=cx*4,z=cz*4;
    const biomes=this.biomes.sample(x-2,z-2,10,10,{scale:4});
    const height=this.depth.sample(x,0,z,5,1,5,200,1,200);
    const main=this.main.sample(x,0,z,5,33,5,f(f(684.412)/80),f(f(684.412)/160),f(f(684.412)/80));
    const lower=this.lower.sample(x,0,z,5,33,5,f(684.412),f(684.412),f(684.412));
    const upper=this.upper.sample(x,0,z,5,33,5,f(684.412),f(684.412),f(684.412));
    const out=new Float64Array(825);
    let index=0,indexHeight=0;
    for(let i=0;i<5;i++)for(let j=0;j<5;j++) {
      let variation=0,root=0,total=0;
      const center=BIOME_HEIGHTS.get(biomes[i+2+(j+2)*10]);
      for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++) {
        const [h,v]=BIOME_HEIGHTS.get(biomes[i+dx+2+(j+dz+2)*10]);
        let w=f(weights[dx+2+(dz+2)*5]/f(h+2));
        if(h>center[0])w=f(w/2);
        variation=f(variation+f(v*w));root=f(root+f(h*w));total=f(total+w);
      }
      variation=f(variation/total);root=f(root/total);
      variation=f(f(variation*f(.9))+f(.1));root=f(f(f(root*4)-1)/8);
      let depth=height[indexHeight++]/8000;
      if(depth<0)depth=-depth*.3;
      depth=depth*3-2;
      if(depth<0) {depth/=2;if(depth < -1)depth=-1;depth/=1.4;depth/=2;}
      else {if(depth>1)depth=1;depth/=8;}
      const elevation=8.5+(root+depth*.2)*8.5/8*4;
      for(let y=0;y<33;y++) {
        let gradient=(y-elevation)*12*128/256/variation;
        if(gradient<0)gradient*=4;
        let value=clampLerp((main[index]/10+1)/2,lower[index]/512,upper[index]/512)-gradient;
        if(y>29) {const blend=f((y-29)/3);value=value*(1-blend)+-10*blend;}
        out[index++]=value;
      }
    }
    return out;
  }
  rawColumn(cx,cz) {
    const density=this.density(cx,cz), states=new Uint16Array(65536);
    // Repeated additions preserve vanilla rounding at the interpolation steps.
    for(let x=0;x<4;x++)for(let z=0;z<4;z++)for(let y=0;y<32;y++) {
      const at=(dx,dz,dy) => density[((x+dx)*5+z+dz)*33+y+dy];
      let a=at(0,0,0),b=at(0,1,0),c=at(1,0,0),d=at(1,1,0);
      const da=(at(0,0,1)-a)*.125,db=(at(0,1,1)-b)*.125;
      const dc=(at(1,0,1)-c)*.125,dd=(at(1,1,1)-d)*.125;
      for(let dy=0;dy<8;dy++) {
        let west=a,east=b;
        const dw=(c-a)*.25,de=(d-b)*.25;
        for(let dx=0;dx<4;dx++) {
          const delta=(east-west)*.25;
          let value=west-delta;
          for(let dz=0;dz<4;dz++) {
            value+=delta;
            states[(y*8+dy)*256+(z*4+dz)*16+x*4+dx]=value>0?16:y*8+dy<63?144:0;
          }
          west+=dw;east+=de;
        }
        a+=da;b+=db;c+=dc;d+=dd;
      }
    }
    return {states,biomes:this.biomes.sample(cx*16,cz*16,16,16),density};
  }
  surfaceColumn(cx,cz) { return replaceSurfaces189(this,cx,cz,this.rawColumn(cx,cz)); }
  carvedColumn(cx,cz) {
    return carveRavines189(this.seed,cx,cz,carveCaves189(this.seed,cx,cz,this.surfaceColumn(cx,cz)));
  }
}
