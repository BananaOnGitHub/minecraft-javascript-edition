// Independently adapted from Glowstone's MIT DoubleTallPlant implementation;
// legacy offsets, block states and RNG consumption verified against native probes.
// world must supply synchronous get(x,y,z) and set(x,y,z,state).
import {FluidUpdates189} from './fluids.js';

export function generateSpring189(world,random,x,y,z,kind,updates=new FluidUpdates189(world)) {
  if(kind!=='water'&&kind!=='lava')throw new RangeError('Unknown spring fluid');
  if((world.get(x,y+1,z)>>4)!==1||(world.get(x,y-1,z)>>4)!==1)return false;
  if(![0,1].includes(world.get(x,y,z)>>4))return false;
  let stone=0,air=0;
  for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const id=world.get(x+dx,y,z+dz)>>4;
    if(id===1)stone++;if(id===0)air++;
  }
  if(stone===3&&air===1) {
    updates.set(x,y,z,(kind==='water'?8:10)<<4,false);
    updates.runImmediate(()=>updates.tick(x,y,z,random));
  }
  return true;
}

export function generateDoublePlant189(world, random, x, y, z, variant) {
  if (!Number.isInteger(variant) || variant < 0 || variant > 5) throw new RangeError('Invalid double plant variant');
  let placed=false;
  for (let i=0;i<64;i++) {
    const bx=x+random.nextInt(8)-random.nextInt(8);
    const by=y+random.nextInt(4)-random.nextInt(4);
    const bz=z+random.nextInt(8)-random.nextInt(8);
    if (by<0 || by>=255 || world.get(bx,by,bz)!==0 || world.get(bx,by+1,bz)!==0) continue;
    const ground=world.get(bx,by-1,bz)>>4;
    if (ground!==2 && ground!==3 && ground!==60) continue;
    world.set(bx,by,bz,(175<<4)|variant);
    world.set(bx,by+1,bz,(175<<4)|10);
    placed=true;
  }
  return placed;
}

// Single-height flower and mushroom patches. Placement checks that depend on
// lighting or biome-specific rules are delegated to the caller's world.
export function generateFlowerPatch189(world, random, x, y, z, state, canPlace) {
  for(let i=0;i<64;i++) {
    const bx=x+random.nextInt(8)-random.nextInt(8);
    const by=y+random.nextInt(4)-random.nextInt(4);
    const bz=z+random.nextInt(8)-random.nextInt(8);
    if(by>=0 && by<256 && world.get(bx,by,bz)===0 && canPlace(world,bx,by,bz,state)) world.set(bx,by,bz,state);
  }
  return true;
}

// Mushroom placement depends on light and block support. The caller supplies
// the exact predicate, allowing a later population world to provide lighting.
export function generateSmallMushroomPatch189(world,random,x,y,z,kind,canPlace) {
  if(kind!=='brown'&&kind!=='red')throw new RangeError('Unknown mushroom feature');
  return generateFlowerPatch189(world,random,x,y,z,(kind==='brown'?39:40)<<4,canPlace);
}

// Tall grass and ferns descend through air and leaves before scattering.
export function generateTallGrassPatch189(world,random,x,y,z,variant) {
  if(variant!==1&&variant!==2)throw new RangeError('Invalid tall grass variant');
  while(y>0 && [0,18,161].includes(world.get(x,y,z)>>4))y--;
  for(let i=0;i<128;i++) {
    const bx=x+random.nextInt(8)-random.nextInt(8);
    const by=y+random.nextInt(4)-random.nextInt(4);
    const bz=z+random.nextInt(8)-random.nextInt(8);
    if(by<0||by>=256||world.get(bx,by,bz)!==0)continue;
    if([2,3,60].includes(world.get(bx,by-1,bz)>>4))world.set(bx,by,bz,(31<<4)|variant);
  }
  return true;
}

// Scatter routines derived from Glowstone's MIT decorators, independently
// checked against isolated native generator outputs.
export function generateDeadBushPatch189(world,random,x,y,z) {
  while(y>0 && [0,18,161].includes(world.get(x,y,z)>>4))y--;
  for(let i=0;i<4;i++) {
    const bx=x+random.nextInt(8)-random.nextInt(8);
    const by=y+random.nextInt(4)-random.nextInt(4);
    const bz=z+random.nextInt(8)-random.nextInt(8);
    if(by<1||by>=256||world.get(bx,by,bz)!==0)continue;
    if([3,12,159,172].includes(world.get(bx,by-1,bz)>>4))world.set(bx,by,bz,32<<4);
  }
  return true;
}

export function generateFruitPatch189(world,random,x,y,z,kind) {
  if(kind!=='pumpkin'&&kind!=='melon')throw new RangeError('Unknown fruit feature');
  for(let i=0;i<64;i++) {
    const bx=x+random.nextInt(8)-random.nextInt(8);
    const by=y+random.nextInt(4)-random.nextInt(4);
    const bz=z+random.nextInt(8)-random.nextInt(8);
    if(by<1||by>=256||world.get(bx,by,bz)!==0||(world.get(bx,by-1,bz)>>4)!==2)continue;
    const metadata=kind==='pumpkin'?(random.nextInt(4)+2)%4:0;
    world.set(bx,by,bz,((kind==='pumpkin'?86:103)<<4)|metadata);
  }
  return true;
}

// Vines grow upward against the first suitable adjacent support. The caller's
// predicate supplies the world's block support/solidity rules.
export function generateVines189(world,random,x,y,z,canAttach) {
  for(;y<128;y++) {
    if(y<0)continue;
    if(world.get(x,y,z)===0) {
      for(const [dx,dz,meta] of [[0,-1,4],[1,0,2],[0,1,1],[-1,0,8]]) {
        if(canAttach(world,x+dx,y,z+dz)) {world.set(x,y,z,(106<<4)|meta);break;}
      }
    } else {
      x+=random.nextInt(4)-random.nextInt(4);
      z+=random.nextInt(4)-random.nextInt(4);
    }
  }
  return true;
}

// Occupancy, support and four horizontal neighbors determine cactus survival.
export function generateCactusPatch189(world,random,x,y,z,isSolid) {
  for(let i=0;i<10;i++) {
    const bx=x+random.nextInt(8)-random.nextInt(8);
    const by=y+random.nextInt(4)-random.nextInt(4);
    const bz=z+random.nextInt(8)-random.nextInt(8);
    // Out-of-height air still consumes the attempted cactus height draws.
    if(world.get(bx,by,bz)!==0)continue;
    const height=1+random.nextInt(random.nextInt(3)+1);
    for(let n=0;n<height;n++) {
      const yy=by+n;
      if(yy<0||yy>=256)continue;
      const below=world.get(bx,yy-1,bz)>>4;
      if(below!==12&&below!==81)continue;
      if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>isSolid(world.get(bx+dx,yy,bz+dz))))continue;
      world.set(bx,yy,bz,81<<4);
    }
  }
  return true;
}

export function generateWaterLilyPatch189(world,random,x,y,z) {
  for(let i=0;i<10;i++) {
    const bx=x+random.nextInt(8)-random.nextInt(8);
    const by=y+random.nextInt(4)-random.nextInt(4);
    const bz=z+random.nextInt(8)-random.nextInt(8);
    if(by<1||by>=256||world.get(bx,by,bz)!==0)continue;
    if(world.get(bx,by-1,bz)===(9<<4)) world.set(bx,by,bz,111<<4);
  }
  return true;
}

export function generateSugarCanePatch189(world,random,x,y,z) {
  for(let i=0;i<20;i++) {
    const bx=x+random.nextInt(4)-random.nextInt(4);
    const bz=z+random.nextInt(4)-random.nextInt(4);
    if(y<1||y>=256||world.get(bx,y,bz)!==0)continue;
    if(![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>[8,9].includes(world.get(bx+dx,y-1,bz+dz)>>4)))continue;
    const height=2+random.nextInt(random.nextInt(3)+1);
    for(let dy=0;dy<height;dy++) {
      if(y+dy>=256)continue;
      const below=world.get(bx,y+dy-1,bz)>>4;
      if(below===83||([2,3,12].includes(below)&&[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>[8,9].includes(world.get(bx+dx,y+dy-1,bz+dz)>>4)))) {
        world.set(bx,y+dy,bz,83<<4);
      }
    }
  }
  return true;
}

// Underwater circular replacement deposits. Radius and target material are
// explicit so the caller can select clay, sand, or gravel features.
export function generateSedimentDeposit189(world,random,x,y,z,kind) {
  const config={clay:{radius:4,state:82<<4,halfHeight:1,replace:[3,82]},
    sand:{radius:7,state:12<<4,halfHeight:2,replace:[2,3]},
    gravel:{radius:6,state:13<<4,halfHeight:2,replace:[2,3]}}[kind];
  if(!config)throw new RangeError('Unknown sediment deposit');
  if(![8,9].includes(world.get(x,y,z)>>4))return false;
  const radius=random.nextInt(config.radius-2)+2;
  for(let bx=x-radius;bx<=x+radius;bx++)for(let bz=z-radius;bz<=z+radius;bz++) {
    if((bx-x)**2+(bz-z)**2>radius*radius)continue;
    for(let by=y-config.halfHeight;by<=y+config.halfHeight;by++) {
      if(by>=0&&by<256&&config.replace.includes(world.get(bx,by,bz)>>4))world.set(bx,by,bz,config.state);
    }
  }
  return true;
}

// Packed-ice patch, using the same cylinder geometry as the independently
// adapted sediment routine. Source placement is gated on a snow surface.
export function generateIcePatch189(world,random,x,y,z,maxRadius=4) {
  if(!Number.isInteger(maxRadius)||maxRadius<3)throw new RangeError('Invalid ice patch radius');
  while(y>2 && world.get(x,y,z)===0)y--;
  if((world.get(x,y,z)>>4)!==80)return false;
  const radius=random.nextInt(maxRadius-2)+2;
  for(let bx=x-radius;bx<=x+radius;bx++)for(let bz=z-radius;bz<=z+radius;bz++) {
    if((bx-x)**2+(bz-z)**2>radius*radius)continue;
    for(let by=y-1;by<=y+1;by++) {
      if(by>=0&&by<256&&[3,80,79].includes(world.get(bx,by,bz)>>4))world.set(bx,by,bz,174<<4);
    }
  }
  return true;
}

// Geometry independently adapted from Glowstone's MIT GlowDesertWell.
export function generateDesertWell189(world,random,x,y,z) {
  while(y>2 && world.get(x,y,z)===0)y--;
  if((world.get(x,y,z)>>4)!==12)return false;
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++) {
    if(world.get(x+dx,y-1,z+dz)===0&&world.get(x+dx,y-2,z+dz)===0)return false;
  }
  const set=(dx,dy,dz,state)=>world.set(x+dx,y+dy,z+dz,state);
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=-1;dy<=0;dy++)set(dx,dy,dz,384);
  for(const [dx,dz] of [[0,0],[-1,0],[1,0],[0,-1],[0,1]])set(dx,0,dz,128);
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)if(Math.abs(dx)===2||Math.abs(dz)===2)set(dx,1,dz,384);
  for(const [dx,dz] of [[-2,0],[2,0],[0,-2],[0,2]])set(dx,1,dz,705);
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)set(dx,4,dz,dx===0&&dz===0?384:705);
  for(const dx of [-1,1])for(const dz of [-1,1])for(let dy=1;dy<=3;dy++)set(dx,dy,dz,384);
  return true;
}

// Cap geometry adapted from Glowstone's MIT BrownMushroomTree and
// RedMushroomTree, with metadata and order checked against native fixtures.
export function generateGiantMushroom189(world,random,x,y,z,kind,isOpaque=state=>state!==0) {
  if(kind!=='brown'&&kind!=='red')throw new RangeError('Unknown giant mushroom');
  const height=4+random.nextInt(3),id=kind==='brown'?99:100;
  if(y<1||y+height+1>=256)return false;
  for(let by=y;by<=y+height+1;by++) {
    const radius=by<=y+3?0:3;
    for(let bx=x-radius;bx<=x+radius;bx++)for(let bz=z-radius;bz<=z+radius;bz++) {
      const state=world.get(bx,by,bz),block=state>>4;
      if(state!==0&&block!==18&&block!==161)return false;
    }
  }
  if(![2,3,110].includes(world.get(x,y-1,z)>>4))return false;
  const capBottom=kind==='brown'?y+height:y+height-3;
  for(let by=capBottom;by<=y+height;by++) {
    const radius=kind==='brown'?3:by<y+height?2:1;
    for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++) {
      let meta=5;
      if(dx===-radius)meta--;else if(dx===radius)meta++;
      if(dz===-radius)meta-=3;else if(dz===radius)meta+=3;
      if(kind==='brown'||by<y+height) {
        if(Math.abs(dx)===radius&&Math.abs(dz)===radius)continue;
        if(dx===-radius+1&&dz===-radius||dx===-radius&&dz===-radius+1)meta=1;
        else if(dx===radius-1&&dz===-radius||dx===radius&&dz===-radius+1)meta=3;
        else if(dx===-radius+1&&dz===radius||dx===-radius&&dz===radius-1)meta=7;
        else if(dx===radius-1&&dz===radius||dx===radius&&dz===radius-1)meta=9;
      }
      if(meta===5&&by<y+height)continue;
      if(!isOpaque(world.get(x+dx,by,z+dz)))world.set(x+dx,by,z+dz,(id<<4)|meta);
    }
  }
  for(let dy=0;dy<height;dy++)if(!isOpaque(world.get(x,y+dy,z)))world.set(x,y+dy,z,(id<<4)|10);
  return true;
}

// Ice-spike contours informed by MIT Glowstone IceSpike.java, with float
// arithmetic and random consumption independently checked by native probes.
export function generateIceSpike189(world,random,x,y,z) {
  while(y>2&&world.get(x,y,z)===0)y--;
  if((world.get(x,y,z)>>4)!==80)return false;
  y+=random.nextInt(4);
  const height=random.nextInt(4)+7;
  const width=Math.trunc(height/4)+random.nextInt(2);
  if(width>1&&random.nextInt(60)===0)y+=10+random.nextInt(30);
  const f=Math.fround,replaceable=s=>[0,3,78,80,79].includes(s>>4);
  for(let dy=0;dy<height;dy++) {
    const radius=f(f(1-f(dy/height))*width),bound=Math.ceil(radius);
    for(let dx=-bound;dx<=bound;dx++)for(let dz=-bound;dz<=bound;dz++) {
      const fx=f(Math.abs(dx)-.25),fz=f(Math.abs(dz)-.25);
      if((dx!==0||dz!==0)&&f(f(fx*fx)+f(fz*fz))>f(radius*radius))continue;
      if((dx===-bound||dx===bound||dz===-bound||dz===bound)&&random.nextFloat()>.75)continue;
      if(y+dy<256&&replaceable(world.get(x+dx,y+dy,z+dz)))world.set(x+dx,y+dy,z+dz,174<<4);
      if(dy!==0&&bound>1&&y-dy>=0&&replaceable(world.get(x+dx,y-dy,z+dz)))world.set(x+dx,y-dy,z+dz,174<<4);
    }
  }
  const stem=Math.min(1,width-1);
  for(let dx=-stem;dx<=stem;dx++)for(let dz=-stem;dz<=stem;dz++) {
    let by=y-1,remaining=50;
    if(Math.abs(dx)===1&&Math.abs(dz)===1)remaining=random.nextInt(5);
    while(by>50) {
      const state=world.get(x+dx,by,z+dz);
      if(!replaceable(state)&&(state>>4)!==174)break;
      world.set(x+dx,by,z+dz,174<<4);by--;
      if(--remaining<=0) {by-=random.nextInt(5)+1;remaining=random.nextInt(5);}
    }
  }
  return true;
}

// Boulder geometry adapted from MIT Glowstone StoneBoulder.java.
export function generateMossyBoulder189(world,random,x,y,z) {
  while(y>3) {
    const below=world.get(x,y-1,z)>>4;
    if(below!==0&&[2,3,1].includes(below))break;
    y--;
  }
  if(y<=3)return false;
  const f=Math.fround;
  for(let i=0;i<3;i++) {
    const rx=random.nextInt(2),ry=random.nextInt(2),rz=random.nextInt(2);
    const radius=f(f(f(rx+ry+rz)*f(.333))+f(.5)),r2=f(radius*radius);
    for(let bx=x-rx;bx<=x+rx;bx++)for(let by=y-ry;by<=y+ry;by++)for(let bz=z-rz;bz<=z+rz;bz++) {
      if((bx-x)**2+(by-y)**2+(bz-z)**2<=r2)world.set(bx,by,bz,48<<4);
    }
    x+=-1+random.nextInt(2);
    y-=random.nextInt(2);
    z+=-1+random.nextInt(2);
  }
  return true;
}
