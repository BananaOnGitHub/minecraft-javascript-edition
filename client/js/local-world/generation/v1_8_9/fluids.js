// Independently authored legacy fluid updates. Glowstone (MIT) was consulted
// for fluid/material rules; numerical native probes establish this contract.
const SIDES = [[0,-1],[1,0],[0,1],[-1,0]];
const NEIGHBORS = [[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]];
export const fluidKind189 = state => {
  const id=state>>4;
  return id===8||id===9?'water':id===10||id===11?'lava':null;
};
const flowingId = kind => kind==='water'?8:10;

// Material movement flags, observed from the native 1.8.9 numeric block palette.
// Collision boxes are not a substitute for material movement rules.
const NON_BLOCKING = new Set([0,6,8,9,10,11,27,28,30,31,32,37,38,39,40,50,51,55,59,65,66,69,75,76,77,78,83,90,93,94,104,105,106,111,115,119,127,131,132,140,141,142,143,144,149,150,157,171,175]);
const BARRIERS = new Set([64,65,68,71,63,83,90,193,194,195,196,197]);
export const blocksFluidMovement189 = state=>!NON_BLOCKING.has(state>>4);

export class FluidUpdates189 {
  constructor(world, random=world.random, {blocksMovement=blocksFluidMovement189,
    isBarrier=state=>BARRIERS.has(state>>4), isLoaded=()=>true,
    schedule, onMix=()=>{}, displace, neighborChanged=()=>{}, vaporizesWater=false}={}) {
    this.world=world; this.random=random;
    this.blocksMovement=blocksMovement; this.isBarrier=isBarrier;
    this.isLoaded=isLoaded; this.scheduled=[];
    this.schedule=schedule??(event=>this.scheduled.push(event));
    this.vaporizesWater=vaporizesWater; this.immediate=false;
    this.onMix=onMix;
    this.neighborChanged=neighborChanged;
    this.displace=displace??((x,y,z,state,kind)=>{
      if(kind==='lava')this.mixEffects(x,y,z);
      else if([37,38,39,40].includes(state>>4)) {
        // One-item plant drops: chance test followed by three spawn offsets.
        // Entity creation belongs to the host, but its RNG consumption does not.
        for(let i=0;i<4;i++)this.random.nextFloat();
      } else throw new Error(`Fluid displacement of block ${state>>4} requires a host displace callback`);
    });
  }
  get(x,y,z) {return y<0||y>=256?0:this.world.get(x,y,z);}
  level(x,y,z,kind) {const s=this.get(x,y,z);return fluidKind189(s)===kind?s&15:-1;}
  blocked(x,y,z) {const s=this.get(x,y,z);return y<0||y>=256||this.isBarrier(s)||this.blocksMovement(s);}
  canFlow(x,y,z,kind) {const s=this.get(x,y,z);return fluidKind189(s)!==kind&&fluidKind189(s)!=='lava'&&!this.blocked(x,y,z);}
  delay(kind) {return kind==='water'?5:this.vaporizesWater?10:30;}
  request(x,y,z,kind,delay=this.delay(kind)) {
    if(this.immediate) {
      if(this.isLoaded(x,y,z,8)&&this.get(x,y,z)>>4===flowingId(kind))this.tick(x,y,z);
    } else this.schedule({x,y,z,block:flowingId(kind),delay});
  }
  set(x,y,z,state,notify=true) {
    if(y<0||y>=256)return;
    const before=this.get(x,y,z);
    if(before===state)return;
    this.world.set(x,y,z,state);
    const kind=fluidKind189(state);
    if((before>>4)!==(state>>4)&&kind) {
      if(!this.mix(x,y,z)&&(state>>4)===flowingId(kind))this.request(x,y,z,kind);
    }
    if(notify)this.notify(x,y,z);
  }
  mix(x,y,z) {
    const state=this.get(x,y,z);
    if(fluidKind189(state)!=='lava')return false;
    for(const [dx,dy,dz] of NEIGHBORS) {
      if(dy===-1||fluidKind189(this.get(x+dx,y+dy,z+dz))!=='water')continue;
      const level=state&15;
      if(level<=4) {this.set(x,y,z,(level===0?49:4)<<4);this.mixEffects(x,y,z);return true;}
    }
    return false;
  }
  mixEffects(x,y,z) {
    // Mixing's sound pitch consumes world RNG even with no audio renderer.
    const f=Math.fround;
    const pitch=f(f(2.6)+f(f(this.random.nextFloat()-this.random.nextFloat())*f(0.8)));
    this.onMix({x,y,z,pitch});
  }
  notify(x,y,z) {
    for(const [dx,dy,dz] of NEIGHBORS) {
      const bx=x+dx,by=y+dy,bz=z+dz,s=this.get(bx,by,bz),kind=fluidKind189(s);
      if(!kind) {this.neighborChanged(bx,by,bz,{x,y,z},this);continue;}
      if(this.mix(bx,by,bz))continue;
      if(s>>4===flowingId(kind)+1) {
        this.set(bx,by,bz,(flowingId(kind)<<4)|(s&15),false);
        this.request(bx,by,bz,kind);
      }
    }
  }
  slope(x,y,z,kind,distance,back) {
    let best=1000;
    for(let i=0;i<4;i++) {
      if(i===back)continue;
      const [dx,dz]=SIDES[i],bx=x+dx,bz=z+dz,s=this.get(bx,y,bz);
      if(this.blocked(bx,y,bz)||(fluidKind189(s)===kind&&(s&15)===0))continue;
      if(!this.blocked(bx,y-1,bz))return distance;
      if(distance<4)best=Math.min(best,this.slope(bx,y,bz,kind,distance+1,(i+2)%4));
    }
    return best;
  }
  directions(x,y,z,kind) {
    let best=1000,result=[];
    for(let i=0;i<4;i++) {
      const [dx,dz]=SIDES[i],bx=x+dx,bz=z+dz,s=this.get(bx,y,bz);
      if(this.blocked(bx,y,bz)||(fluidKind189(s)===kind&&(s&15)===0))continue;
      const cost=this.blocked(bx,y-1,bz)?this.slope(bx,y,bz,kind,1,(i+2)%4):0;
      if(cost<best){best=cost;result=[];}
      if(cost===best)result.push(SIDES[i]);
    }
    // The native selection is an EnumSet: application follows facing ordinal
    // order (north, south, west, east), not the horizontal search iterator.
    return result.sort((a,b)=>[0,3,1,2][SIDES.indexOf(a)]-[0,3,1,2][SIDES.indexOf(b)]);
  }
  flow(x,y,z,kind,level) {
    if(!this.canFlow(x,y,z,kind))return;
    const previous=this.get(x,y,z);
    if(previous!==0)this.displace(x,y,z,previous,kind,this.random);
    this.set(x,y,z,(flowingId(kind)<<4)|level);
  }
  tick(x,y,z,random=this.random) {
    const state=this.get(x,y,z),kind=fluidKind189(state);
    if(!kind||state>>4!==flowingId(kind))return;
    let level=state&15;
    const step=kind==='lava'&&!this.vaporizesWater?2:1;
    if(level>0) {
      let minimum=-1,sources=0;
      for(const [dx,dz] of SIDES) {
        let n=this.level(x+dx,y,z+dz,kind);
        if(n<0)continue;
        if(n===0)sources++;
        if(n>=8)n=0;
        if(minimum<0||n<minimum)minimum=n;
      }
      let next=minimum+step;
      if(minimum<0||next>=8)next=-1;
      const above=this.level(x,y+1,z,kind);
      if(above>=0)next=above>=8?above:above+8;
      if(sources>=2&&kind==='water'&&(this.blocksMovement(this.get(x,y-1,z))||this.level(x,y-1,z,kind)===0))next=0;
      let delay=this.delay(kind);
      if(kind==='lava'&&level<8&&next<8&&next>level&&random.nextInt(4)!==0)delay*=4;
      if(next===level)this.set(x,y,z,((flowingId(kind)+1)<<4)|level,false);
      else {
        level=next;
        if(next<0)this.set(x,y,z,0);
        else {this.set(x,y,z,(flowingId(kind)<<4)|next,false);this.request(x,y,z,kind,delay);this.notify(x,y,z);}
      }
    } else this.set(x,y,z,((flowingId(kind)+1)<<4)|level,false);
    if(this.canFlow(x,y-1,z,kind)) {
      if(kind==='lava'&&fluidKind189(this.get(x,y-1,z))==='water') {this.set(x,y-1,z,16);this.mixEffects(x,y-1,z);}
      else this.flow(x,y-1,z,kind,level>=8?level:level+8);
    } else if(level>=0&&(level===0||this.blocked(x,y-1,z))) {
      const next=level>=8?1:level+step;
      if(next>=8)return;
      for(const [dx,dz] of this.directions(x,y,z,kind))this.flow(x+dx,y,z+dz,kind,next);
    }
  }
  runImmediate(update) {
    const previous=this.immediate;this.immediate=true;
    try{return update();}finally{this.immediate=previous;}
  }
}
