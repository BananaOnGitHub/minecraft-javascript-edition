// Ellipsoid geometry informed by Glowstone Lake.java (MIT); legacy behavior
// is independently checked with numerical observations from the local server.
import {fluidKind189} from './fluids.js';

/** Generate one lake against a synchronous, mutable generation world.
 * canFreezeWater(x,y,z) and topBlock(x,y,z) provide the biome/world services.
 */
export function generateLake189(world, random, x, y, z, kind, {canFreezeWater, topBlock} = {}) {
  if (kind !== 'water' && kind !== 'lava') throw new RangeError('Lake kind must be water or lava');
  if (kind === 'water' && typeof canFreezeWater !== 'function') throw new TypeError('Supply the native freeze-water predicate');
  if (typeof topBlock !== 'function') throw new TypeError('Supply the biome surface block selector');
  x -= 8; z -= 8;
  while (y > 5 && world.get(x,y,z) === 0) y--;
  if (y <= 4) return false;
  y -= 4;
  const mask = new Uint8Array(2048), index = (x,z,y) => (x*16+z)*8+y;
  const count = random.nextInt(4)+4;
  for (let n=0; n<count; n++) {
    const sx=random.nextDouble()*6+3, sy=random.nextDouble()*4+2, sz=random.nextDouble()*6+3;
    const cx=random.nextDouble()*(16-sx-2)+1+sx/2, cy=random.nextDouble()*(8-sy-4)+2+sy/2;
    const cz=random.nextDouble()*(16-sz-2)+1+sz/2;
    for (let dx=1; dx<15; dx++) for (let dz=1; dz<15; dz++) for (let dy=1; dy<7; dy++) {
      const nx=(dx-cx)/(sx/2), ny=(dy-cy)/(sy/2), nz=(dz-cz)/(sz/2);
      if (nx*nx+ny*ny+nz*nz<1) mask[index(dx,dz,dy)]=1;
    }
  }
  const edge=(dx,dz,dy)=>!mask[index(dx,dz,dy)]&&(
    (dx<15&&mask[index(dx+1,dz,dy)])||(dx>0&&mask[index(dx-1,dz,dy)])||
    (dz<15&&mask[index(dx,dz+1,dy)])||(dz>0&&mask[index(dx,dz-1,dy)])||
    (dy<7&&mask[index(dx,dz,dy+1)])||(dy>0&&mask[index(dx,dz,dy-1)]));
  for (let dx=0; dx<16; dx++) for (let dz=0; dz<16; dz++) for (let dy=0; dy<8; dy++) {
    if (!edge(dx,dz,dy)) continue;
    const state=world.get(x+dx,y+dy,z+dz);
    if (dy>=4 && fluidKind189(state)) return false;
    if (dy<4 && !world.blocksMovement(state) && fluidKind189(state)!==kind) return false;
  }
  for (let dx=0; dx<16; dx++) for (let dz=0; dz<16; dz++) for (let dy=0; dy<8; dy++) {
    if (mask[index(dx,dz,dy)]) world.set(x+dx,y+dy,z+dz,dy>=4?0:(kind==='water'?144:176));
  }
  for (let dx=0; dx<16; dx++) for (let dz=0; dz<16; dz++) for (let dy=4; dy<8; dy++) {
    if (mask[index(dx,dz,dy)] && world.get(x+dx,y+dy-1,z+dz)===48 && world.getSkyLight(x+dx,y+dy,z+dz)>0)
      world.set(x+dx,y+dy-1,z+dz,topBlock(x+dx,y+dy-1,z+dz)===1760?1760:32);
  }
  if (kind==='lava') for (let dx=0; dx<16; dx++) for (let dz=0; dz<16; dz++) for (let dy=0; dy<8; dy++) {
    if (edge(dx,dz,dy) && (dy<4||random.nextInt(2)!==0) && world.blocksMovement(world.get(x+dx,y+dy,z+dz)))
      world.set(x+dx,y+dy,z+dz,16);
  }
  if (kind==='water') for (let dx=0; dx<16; dx++) for (let dz=0; dz<16; dz++) {
    if (canFreezeWater(x+dx,y+4,z+dz)) world.set(x+dx,y+4,z+dz,79<<4);
  }
  return true;
}
