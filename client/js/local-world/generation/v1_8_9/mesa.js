// Mesa ground algorithm derived from Glowstone's MIT MesaGroundGenerator.
// Native numerical fixtures determine the legacy palette and surface details.
import { JavaRandom } from '../../java-random.js';
import { SimplexOctaves189 } from './noise.js';
const clay=2752,orange=2545,redSand=193;
function point(noise,x,z) {
  let value=0,frequency=1;
  for(const octave of noise.octaves) {value+=octave.sample(x*frequency,z*frequency)/frequency;frequency/=2;}
  return value;
}
export class MesaSurface189 {
  constructor(seed) {
    const random=new JavaRandom(seed);
    this.colorNoise=new SimplexOctaves189(random,1);
    this.bands=new Uint16Array(64).fill(clay);
    for(let i=0;i<64;i++) {i+=random.nextInt(5)+1;if(i<64)this.bands[i]=orange;}
    for(const [minimum,thickness,color] of [[2,1,4],[2,2,12],[2,1,14]]) {
      const count=random.nextInt(4)+minimum;
      for(let i=0;i<count;i++) {
        const length=random.nextInt(3)+thickness,start=random.nextInt(64);
        for(let j=0;j<length && start+j<64;j++)this.bands[start+j]=2544+color;
      }
    }
    const count=random.nextInt(3)+3;
    let position=0;
    for(let i=0;i<count;i++) {
      position+=random.nextInt(16)+4;
      if(position<64) {
        this.bands[position]=2544;
        if(position>1 && random.nextBoolean())this.bands[position-1]=2552;
        if(position<63 && random.nextBoolean())this.bands[position+1]=2552;
      }
    }
    // A fresh 1.8.9 biome singleton initializes pillar samplers using its old
    // cached seed (zero), before installing the world seed. Keep this local and
    // deterministic instead of depending on other worlds loaded in the process.
    const pillars=new JavaRandom(0n);
    this.pillarNoise=new SimplexOctaves189(pillars,4);
    this.roofNoise=new SimplexOctaves189(pillars,1);
  }
  band(x,y,z) {
    // Legacy band offsets sample X on both axes, including at negative X.
    const offset=Math.floor(point(this.colorNoise,x/512,x/512)*2+.5);
    return this.bands[(y+offset+64)%64];
  }
  replace(states,index,id,noise,random,x,z) {
    const bryce=id===165,forest=id===38||id===166;
    let pillar=0;
    if(bryce) {
      const nx=(x&-16)+(z&15),nz=(z&-16)+(x&15);
      const height=Math.min(Math.abs(noise),point(this.pillarNoise,nx*.25,nz*.25));
      if(height>0) {
        const roof=Math.abs(point(this.roofNoise,nx/512,nz/512));
        pillar=Math.min(height*height*2.5,Math.ceil(roof*50)+14)+64;
      }
    }
    const depth=Math.trunc(noise/3+3+random.nextDouble()*.25);
    const plain=Math.cos(noise/3*Math.PI)>0;
    let remaining=-1,sand=false,top=redSand,filler=orange;
    for(let y=255;y>=0;y--) {
      const offset=y*256+index;
      if(states[offset]===0 && y<Math.trunc(pillar))states[offset]=16;
      if(y<=random.nextInt(5)) {states[offset]=112;continue;}
      const state=states[offset];
      if(state===0)remaining=-1;
      else if(state===16) {
        if(remaining===-1) {
          sand=false;
          if(depth<=0) {top=0;filler=16;}
          else if(y>=59 && y<=64) {top=redSand;filler=orange;}
          if(y<63 && top===0)top=144;
          remaining=depth+Math.max(0,y-63);
          if(y>=62) {
            if(forest && y>86+depth*2)states[offset]=plain?49:32;
            else if(y>66+depth)states[offset]=y>=64&&y<=127?(plain?clay:this.band(x,y,z)):orange;
            else {states[offset]=top;sand=true;}
          } else states[offset]=(filler>>4)===159?orange:filler;
        } else if(remaining>0) {
          remaining--;states[offset]=sand?orange:this.band(x,y,z);
        }
      }
    }
  }
}
