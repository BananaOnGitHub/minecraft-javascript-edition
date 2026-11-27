// Independent synchronous generation host. Storage and relighting primitives
// reuse the existing worker-safe client. Synchronous lighting preserves section
// allocation, neighbor-column checks and native opacity/emission trigger timing.
import {World} from '../../../world/world.js';
import {Chunk,Section} from '../../../world/chunk.js';
import {BLOCK_PROPERTIES_189 as properties} from './block-properties.js';
import {FluidUpdates189} from './fluids.js';

const directions=[[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
export class GenerationWorld189 extends World {
  constructor({random,loadColumn,minChunkX,maxChunkX,minChunkZ,maxChunkZ}) {
    super();this.random=random;this.loadColumn=loadColumn;
    if(!random||typeof loadColumn!=='function'||![minChunkX,maxChunkX,minChunkZ,maxChunkZ].every(Number.isInteger)||minChunkX>maxChunkX||minChunkZ>maxChunkZ)throw new TypeError('Supply world RNG, column loader and integer loaded bounds');
    Object.assign(this,{minChunkX,maxChunkX,minChunkZ,maxChunkZ});
    this.drops=[];this.changes=new Map();
    this.fluids=new FluidUpdates189(this,random,{isLoaded:(x,y,z,r)=>this.isLoaded(x,y,z,r),
      displace:(...args)=>this.displace(...args),neighborChanged:(...args)=>this.neighborChanged(...args)});
  }
  containsChunk(x,z){return x>=this.minChunkX&&x<=this.maxChunkX&&z>=this.minChunkZ&&z<=this.maxChunkZ;}
  isLoaded(x,y,z,r=0){return this.containsChunk((x-r)>>4,(z-r)>>4)&&this.containsChunk((x+r)>>4,(z+r)>>4);}
  _chunk(cx,cz) {
    if(!this.containsChunk(cx,cz))return null;
    const key=`${cx},${cz}`;let c=this.chunks.get(key);if(c)return c;
    // Physical arrays are retained for client-storage reuse; logical allocation
    // remains separate because a new native section takes a different light path.
    c=new Chunk(cx,cz,true);c.allocated=new Uint8Array(16);this.chunks.set(key,c);
    const data=this.loadColumn(cx,cz);
    for(let sy=0;sy<16;sy++) {
      const s=new Section(true);s.blocks.set(data.subarray(sy*4096,(sy+1)*4096));s.recount();c.sections[sy]=s;
      if(s.nonAir)c.allocated[sy]=1;
    }
    this._computeHeights(c);
    for(let z=0;z<16;z++)for(let x=0;x<16;x++) {
      let light=15;
      for(let y=255;y>=0;y--) {
        const opacity=this.opacity(c.getState(x,y,z));
        light=Math.max(0,light-(opacity|| (light===15?0:1)));
        // Provider-created sections start with zero cached block light, even
        // where the input contains an emitter. A later check seeds propagation.
        c.setSkyLight(x,y,z,light);c.setBlockLightAt(x,y,z,0);
      }
    }
    return c;
  }
  getState(x,y,z){if(y<0||y>255)return 0;const c=this._chunk(x>>4,z>>4);if(!c)throw new RangeError('Generation read outside loaded region');return c.getState(x&15,y,z&15);}
  get(x,y,z){return this.getState(x,y,z);}
  opacity(s){return properties[s>>4]?.[1]??255;}
  isOpaque(s){return properties[s>>4]?.[3]??false;}
  isFullCube(s){return properties[s>>4]?.[4]??false;}
  isFullBlock(s){return properties[s>>4]?.[7]??false;}
  blocksMovement(s){return properties[s>>4]?.[5]??false;}
  height(x,z){return this._chunk(x>>4,z>>4).heightMap[((z&15)<<4)|(x&15)];}
  topSolidOrLiquid(x,z){for(let y=255;y>=0;y--){const s=this.get(x,y,z);if(this.blocksMovement(s)&&![18,161].includes(s>>4))return y+1;}return 0;}
  canSeeSky(x,y,z){return y>=this.height(x,z);}
  getLight(x,y,z){return Math.max(this.getSkyLight(x,y,z),this.getBlockLight(x,y,z));}
  lightFromNeighbors(x,y,z){
    if(!properties[this.get(x,y,z)>>4]?.[6])return this.getLight(x,y,z);
    return Math.max(...[[0,1,0],[-1,0,0],[1,0,0],[0,0,-1],[0,0,1]].map(([dx,dy,dz])=>this.getLight(x+dx,y+dy,z+dz)));
  }
  _sourceLevel(sky,x,y,z){return sky?(this.canSeeSky(x,y,z)?15:0):(properties[this.get(x,y,z)>>4]?.[2]??0);}
  rebuildSkylight(c) {
    this._computeHeights(c);
    for(let z=0;z<16;z++)for(let x=0;x<16;x++) {
      let light=15;
      // A skylight-map construction writes positive values; it does not settle
      // lateral light or erase the cached values below the attenuation frontier.
      for(let y=255;y>=0&&light>0;y--){const op=this.opacity(c.getState(x,y,z));light=Math.max(0,light-(op||(light===15?0:1)));if(light>0)c.setSkyLight(x,y,z,light);}
    }
  }
  _setL(sky,x,y,z,value,dirty) {
    if(y>=0&&y<256){const c=this._chunk(x>>4,z>>4);if(c&&!c.allocated[y>>4]){c.allocated[y>>4]=1;c.sections[y>>4].skyLight.fill(0);this.rebuildSkylight(c);}}
    super._setL(sky,x,y,z,value,dirty);
  }
  computedLight(sky,x,y,z) {
    const source=this._sourceLevel(sky,x,y,z);if(source>=15)return 15;
    const state=this.get(x,y,z),raw=this.opacity(state);
    const op=Math.max(1,raw>=15&&properties[state>>4]?.[2]>0?1:raw);
    if(op>=15)return source;
    let value=source;
    for(const [dx,dy,dz]of directions)value=Math.max(value,this._getL(sky,x+dx,y+dy,z+dz)-op);
    return value;
  }
  checkLight(sky,x,y,z) {
    const current=this._getL(sky,x,y,z),target=this.computedLight(sky,x,y,z);
    if(current===target)return;
    const queue=[[x,y,z,current]],dirty=new Set();
    // A processed entry below distance 17 may enqueue its distance-17 neighbor.
    const near=(bx,by,bz)=>by>=0&&by<256&&Math.abs(x-bx)+Math.abs(y-by)+Math.abs(z-bz)<=17&&this.isLoaded(bx,by,bz);
    if(target<current)for(let i=0;i<queue.length;i++) {
      const [bx,by,bz,level]=queue[i];if(this._getL(sky,bx,by,bz)!==level)continue;
      this._setL(sky,bx,by,bz,0,dirty);
      if(level<=0)continue;
      for(const [dx,dy,dz]of directions) {
        const nx=bx+dx,ny=by+dy,nz=bz+dz;if(!near(nx,ny,nz))continue;
        const expected=level-Math.max(1,this.opacity(this.get(nx,ny,nz)));
        if(expected>=0&&this._getL(sky,nx,ny,nz)===expected)queue.push([nx,ny,nz,expected]);
      }
    }
    for(let i=0;i<queue.length;i++) {
      const [bx,by,bz]=queue[i],old=this._getL(sky,bx,by,bz),next=this.computedLight(sky,bx,by,bz);
      if(old===next)continue;
      this._setL(sky,bx,by,bz,next,dirty);
      if(next>old)for(const [dx,dy,dz]of directions){const nx=bx+dx,ny=by+dy,nz=bz+dz;if(near(nx,ny,nz)&&this._getL(sky,nx,ny,nz)<next)queue.push([nx,ny,nz,0]);}
    }
  }
  set(x,y,z,state) {
    if((state>>4)>=8&&(state>>4)<=11&&((this.get(x,y,z)>>4)!==(state>>4))) {
      this.fluids.set(x,y,z,state,false);return true;
    }
    return this.setRaw(x,y,z,state);
  }
  setRaw(x,y,z,state) {
    if(y<0||y>255)return false;
    const c=this._chunk(x>>4,z>>4);if(!c)throw new RangeError('Generation write outside loaded region');
    const previous=c.getState(x&15,y,z&15);
    if(previous===state)return false;
    this.changes.set(`${x},${y},${z}`,state);
    const freshSection=!c.allocated[y>>4];c.allocated[y>>4]=1;
    const oldHeight=this.height(x,z);c.setState(x&15,y,z&15,state);
    // Leaf break hooks run after storage replacement but before the outer
    // height/light update. The feature helpers then see already-marked leaves.
    if([18,161].includes(previous>>4)&&(previous>>4)!==(state>>4))
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++) {
        const by=y+dy;if(by<0||by>=256)continue;
        const s=this.get(x+dx,by,z+dz);if([18,161].includes(s>>4)&&!(s&8))this.set(x+dx,by,z+dz,s|8);
      }
    this._updateHeight(c,x&15,y,z&15,state);
    const newHeight=this.height(x,z);
    if(freshSection&&y>=oldHeight) {
      c.sections[y>>4].skyLight.fill(0);this.rebuildSkylight(c);
    } else if(oldHeight!==newHeight) {
      let light=15;
      for(let by=Math.max(oldHeight,newHeight);by>=0;by--) {
        const opacity=this.opacity(this.get(x,by,z));light=Math.max(0,light-(opacity||(light===15?0:1)));
        c.setSkyLight(x&15,by,z&15,light);if(light===0&&by<Math.min(oldHeight,newHeight))break;
      }
    }
    // In particular, metadata-only leaf writes and nonemitting plants must not
    // eagerly settle cached skylight. Brown mushrooms (emission 1) do trigger it.
    if(this.opacity(previous)!==this.opacity(state)||properties[previous>>4]?.[2]!==properties[state>>4]?.[2]) {
      this.checkLight(true,x,y,z);this.checkLight(false,x,y,z);
    }
    // Complete each neighbor column before checking the changed column. The
    // sequence matters: every check observes the preceding cached-light writes.
    if(!freshSection&&newHeight!==oldHeight)for(const [dx,dz]of [[-1,0],[1,0],[0,-1],[0,1],[0,0]])for(let by=Math.min(newHeight,oldHeight);by<Math.max(newHeight,oldHeight);by++)
      if(this.isLoaded(x+dx,by,z+dz))this.checkLight(true,x+dx,by,z+dz);
    return true;
  }
  canPlace(state,x,y,z) {
    if(y<0||y>=256)return false;
    const id=state>>4,below=this.get(x,y-1,z),ground=below>>4;
    if(id===39||id===40)return ground===110||below===50||(this.getLight(x,y,z)<13&&this.isFullBlock(below));
    if(id===32)return [3,12,159,172].includes(ground);
    if(id===81)return [12,81].includes(ground)&&directions.filter(d=>d[1]===0).every(([dx,,dz])=>!this.blocksMovement(this.get(x+dx,y,z+dz))&&![8,9,10,11].includes(this.get(x+dx,y,z+dz)>>4));
    if(id===111)return below===144;
    if(id===83)return ground===83||([2,3,12].includes(ground)&&directions.filter(d=>d[1]===0).some(([dx,,dz])=>[8,9].includes(this.get(x+dx,y-1,z+dz)>>4)));
    if(id===31||id===175)return [2,3,60].includes(ground);
    if(id===37||id===38)return [2,3,60].includes(ground);
    throw new RangeError(`Unimplemented plant predicate ${id}`);
  }
  canAttachVine(world,x,y,z){return world.isFullCube(world.get(x,y,z))&&world.blocksMovement(world.get(x,y,z));}
  setAndNotify(x,y,z,state){const changed=this.set(x,y,z,state);if(changed)this.fluids.notify(x,y,z);return changed;}
  displace(x,y,z,state,kind,random=this.random) {
    if(kind==='lava'){this.fluids.mixEffects(x,y,z);return;}
    const id=state>>4;
    if(![6,31,32,37,38,39,40,50,81,83,106,111].includes(id))throw new Error(`Unimplemented fluid destruction ${id}`);
    let drop=id!==32&&id!==106;
    if(id===31)drop=random.nextInt(8)===0;
    if(drop){const chance=random.nextFloat(),offsets=[random.nextFloat(),random.nextFloat(),random.nextFloat()];this.drops.push({x,y,z,state,chance,offsets});}
  }
  neighborChanged(x,y,z) {
    const s=this.get(x,y,z),id=s>>4;
    if(id===106) {
      let faces=s&15;const above=this.get(x,y+1,z);
      for(const [dx,dz,bit]of [[0,1,1],[-1,0,2],[0,-1,4],[1,0,8]])
        if(!this.canAttachVine(this,x+dx,y,z+dz)&&!((above>>4)===106&&(above&bit)))faces&=~bit;
      if(faces===0&&!this.canAttachVine(this,x,y+1,z)) {this.set(x,y,z,0);this.fluids.notify(x,y,z);}
      else if(faces!==(s&15))this.set(x,y,z,(106<<4)|faces);
      return;
    }
    if([31,32,37,38,39,40,81,83,111].includes(id)&&!this.canPlace(s,x,y,z)) {
      this.displace(x,y,z,s,'water');this.set(x,y,z,0);this.fluids.notify(x,y,z);
    }
  }
}
