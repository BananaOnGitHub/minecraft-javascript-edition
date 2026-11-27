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
