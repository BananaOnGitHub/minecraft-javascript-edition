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
