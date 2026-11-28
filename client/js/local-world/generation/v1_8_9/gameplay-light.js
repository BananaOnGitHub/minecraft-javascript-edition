// Settled presentation lighting, deliberately separate from population's cached
// GenerationWorld189 light. Independent six-neighbor maximum-light propagation;
// numerical provenance and lifecycle limits: docs/gameplay-lighting.md.
import {BLOCK_PROPERTIES_189} from './block-properties.js';

/** Derive the center column's gameplay light from a complete 3x3 state halo.
 * Never mutates inputs, runs features, advances RNG, or admits population.
 * A level-15 source cannot influence the center across this halo's outer edge.
 */
export function gameplayLight189(cx,cz,loadColumn,edits=new Map()) {
  const width=48,plane=width*width,size=plane*256;
  const opacity=new Uint8Array(size),sky=new Uint8Array(size),block=new Uint8Array(size);
  let center;
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
    const col=loadColumn(cx+dx,cz+dz);
    if(!col)throw new Error(`Gameplay lighting requires prepared halo ${cx+dx},${cz+dz}`);
    if(dx===0&&dz===0)center=col;
    const overlay=edits.get(`${cx+dx},${cz+dz}`);
    for(let z=0;z<16;z++)for(let x=0;x<16;x++){
      let light=15;
      for(let y=255;y>=0;y--){
        const cell=y*256+z*16+x,state=overlay?.get(cell)??col.states[cell];
        const at=y*plane+((dz+1)*16+z)*width+(dx+1)*16+x;
        const props=BLOCK_PROPERTIES_189[state>>4],op=props?.[1]??255;
        block[at]=props?.[2]??0;
        opacity[at]=op>=15&&block[at]>0?1:op;
        light=Math.max(0,light-(op||(light===15?0:1)));sky[at]=light;
      }
    }
  }
  // Seed only frontiers, rather than enqueueing the entire sunlit atmosphere.
  // Descending buckets bound queue storage and process each final level once.
  const neighbors=(i,visit)=>{
    const x=i%width,z=Math.floor(i/width)%width,y=Math.floor(i/plane);
    if(x>0)visit(i-1);if(x<47)visit(i+1);
    if(z>0)visit(i-width);if(z<47)visit(i+width);
    if(y>0)visit(i-plane);if(y<255)visit(i+plane);
  };
  const propagate=light=>{
    const buckets=Array.from({length:16},()=>[]);
    for(let i=0;i<size;i++){
      if(light[i]<=1)continue;
      let frontier=false;
      neighbors(i,j=>{if(light[i]-Math.max(1,opacity[j])>light[j])frontier=true;});
      if(frontier)buckets[light[i]].push(i);
    }
    for(let level=15;level>1;level--)for(const i of buckets[level]){
      if(light[i]!==level)continue;
      neighbors(i,j=>{const value=level-Math.max(1,opacity[j]);
        if(value>light[j]){light[j]=value;if(value>1)buckets[value].push(j);}
      });
    }
  };
  propagate(sky);propagate(block);
  const skyLight=new Uint8Array(32768),blockLight=new Uint8Array(32768);
  const overlay=edits.get(`${cx},${cz}`),states=overlay?center.states.slice():center.states;
  if(overlay)for(const [i,s]of overlay)states[i]=s;
  let lastSection=0;
  for(let y=0;y<256;y++)for(let z=0;z<16;z++)for(let x=0;x<16;x++){
    const i=y*256+z*16+x,at=y*plane+(z+16)*width+x+16,shift=(i&1)*4;
    skyLight[i>>1]|=sky[at]<<shift;blockLight[i>>1]|=block[at]<<shift;
    if(states[i]||sky[at]!==15||block[at])lastSection=Math.max(lastSection,y>>4);
  }
  return {states,biomes:center.biomes,skyLight,blockLight,lastSection};
}
