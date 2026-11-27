// Independently adapted from Glowstone's MIT DoubleTallPlant implementation;
// legacy offsets, block states and RNG consumption verified against native probes.
// world must supply synchronous get(x,y,z) and set(x,y,z,state).
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
    if(by<0||by>=256||world.get(bx,by,bz)!==0)continue;
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
  const config={clay:{radius:4,state:82<<4,halfHeight:1,replace:[3,12]},
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
