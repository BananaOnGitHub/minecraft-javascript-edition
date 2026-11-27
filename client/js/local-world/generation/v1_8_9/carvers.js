// Independently implemented legacy random-walk carvers. Numerical behavior is
// checked against separate native stage outputs, not populated world snapshots.
import { JavaRandom } from '../../java-random.js';
const f=Math.fround,PI=f(Math.PI);
const sine=new Float32Array(65536);
for(let i=0;i<sine.length;i++)sine[i]=Math.sin(i*Math.PI*2/65536);
export const sin189 = angle => sine[Math.trunc(f(angle*f(10430.378)))&65535];
export const cos189 = angle => sine[Math.trunc(f(f(angle*f(10430.378))+16384))&65535];
const water = state => state>>4===8||state>>4===9;
const carveable = (state,above) => [1,2,3,24,78,110,159,172,179].includes(state>>4)||
  ((state>>4===12||state>>4===13)&&!water(above));
const surfaceTop = id => id===14||id===15?1760:id===140?1280:32;

function ellipsoid(column,cx,cz,x,y,z,horizontal,vertical,ravineWidths) {
  const {states,biomes}=column;
  const minX=Math.max(0,Math.floor(x-horizontal)-cx*16-1),maxX=Math.min(16,Math.floor(x+horizontal)-cx*16+1);
  const minZ=Math.max(0,Math.floor(z-horizontal)-cz*16-1),maxZ=Math.min(16,Math.floor(z+horizontal)-cz*16+1);
  const minY=Math.max(1,Math.floor(y-vertical)-1),maxY=Math.min(248,Math.floor(y+vertical)+1);
  for(let lx=minX;lx<maxX;lx++)for(let lz=minZ;lz<maxZ;lz++) {
    for(let ly=maxY+1;ly>=minY-1;ly--) {
      if(ly>=0&&ly<256&&water(states[ly*256+lz*16+lx]))return false;
      if(ly!==minY-1 && lx!==minX && lx!==maxX-1 && lz!==minZ && lz!==maxZ-1)ly=minY;
    }
  }
  for(let lx=minX;lx<maxX;lx++) {
    const dx=(lx+cx*16+.5-x)/horizontal;
    for(let lz=minZ;lz<maxZ;lz++) {
      const dz=(lz+cz*16+.5-z)/horizontal,index=lz*16+lx;
      if(dx*dx+dz*dz>=1)continue;
      let foundTop=false;
      for(let ly=maxY;ly>minY;ly--) {
        const dy=(ly-.5-y)/vertical;
        if(ravineWidths ? (dx*dx+dz*dz)*ravineWidths[ly-1]+dy*dy/6>=1 : dy<=-.7||dx*dx+dy*dy+dz*dz>=1)continue;
        const offset=ly*256+index,state=states[offset];
        if(state>>4===2||!ravineWidths&&state>>4===110)foundTop=true;
        if(ravineWidths ? ![1,2,3].includes(state>>4) : !carveable(state,states[offset+256]))continue;
        if(ly-1<10)states[offset]=ravineWidths?160:176;
        else {
          states[offset]=0;
          if(foundTop && states[offset-256]>>4===3)states[offset-256]=column.surfaceTops?.get(biomes[index])??surfaceTop(biomes[index]);
          if(!ravineWidths && states[offset+256]>>4===12)states[offset+256]=(states[offset+256]&15)===1?2864:384;
        }
      }
    }
  }
  return true;
}
function cavePath(seed,column,cx,cz,x,y,z,radius,yaw,pitch,start,length,verticalScale) {
  const random=new JavaRandom(seed),centerX=cx*16+8,centerZ=cz*16+8;
  let pitchTurn=0,yawTurn=0;
  if(length<=0)length=112-random.nextInt(28);
  const room=start===-1;
  if(room)start=Math.trunc(length/2);
  const branch=random.nextInt(Math.trunc(length/2))+Math.trunc(length/4),gentle=random.nextInt(6)===0;
  for(let t=start;t<length;t++) {
    const horizontal=1.5+f(sin189(f(f(t*PI)/length))*radius),vertical=horizontal*verticalScale;
    const cp=cos189(pitch);
    x+=f(cos189(yaw)*cp);y+=sin189(pitch);z+=f(sin189(yaw)*cp);
    pitch=f(pitch*(gentle?f(.92):f(.7)));
    pitch=f(pitch+f(pitchTurn*f(.1)));yaw=f(yaw+f(yawTurn*f(.1)));
    pitchTurn=f(pitchTurn*f(.9));yawTurn=f(yawTurn*f(.75));
    pitchTurn=f(pitchTurn+f(f(f(random.nextFloat()-random.nextFloat())*random.nextFloat())*2));
    yawTurn=f(yawTurn+f(f(f(random.nextFloat()-random.nextFloat())*random.nextFloat())*4));
    if(!room && t===branch && radius>1) {
      cavePath(random.nextLong(),column,cx,cz,x,y,z,f(f(random.nextFloat()*.5)+.5),f(yaw-f(PI/2)),f(pitch/3),t,length,1);
      cavePath(random.nextLong(),column,cx,cz,x,y,z,f(f(random.nextFloat()*.5)+.5),f(yaw+f(PI/2)),f(pitch/3),t,length,1);
      return;
    }
    if(!room && random.nextInt(4)===0)continue;
    const dx=x-centerX,dz=z-centerZ,left=length-t,reach=radius+2+16;
    if(dx*dx+dz*dz-left*left>reach*reach)return;
    if(x<centerX-16-horizontal*2||x>centerX+16+horizontal*2||z<centerZ-16-horizontal*2||z>centerZ+16+horizontal*2)continue;
    const carved=ellipsoid(column,cx,cz,x,y,z,horizontal,vertical);
    if(room&&carved)break;
  }
}

export function carveCaves189(seed,cx,cz,column) {
  const random=new JavaRandom(seed),xSeed=random.nextLong(),zSeed=random.nextLong();
  for(let ox=cx-8;ox<=cx+8;ox++)for(let oz=cz-8;oz<=cz+8;oz++) {
    random.setSeed(BigInt.asIntN(64,BigInt(ox)*xSeed^BigInt(oz)*zSeed^seed));
    let count=random.nextInt(random.nextInt(random.nextInt(15)+1)+1);
    if(random.nextInt(7)!==0)count=0;
    for(let i=0;i<count;i++) {
      const x=ox*16+random.nextInt(16),y=random.nextInt(random.nextInt(120)+8),z=oz*16+random.nextInt(16);
      let paths=1;
      if(random.nextInt(4)===0) {
        const roomSeed=random.nextLong(),radius=f(1+f(random.nextFloat()*6));
        cavePath(roomSeed,column,cx,cz,x,y,z,radius,0,0,-1,-1,.5);
        paths+=random.nextInt(4);
      }
      for(let j=0;j<paths;j++) {
        const yaw=f(f(random.nextFloat()*PI)*2),pitch=f(f(f(random.nextFloat()-.5)*2)/8);
        let radius=f(f(random.nextFloat()*2)+random.nextFloat());
        if(random.nextInt(10)===0)radius=f(radius*f(f(f(random.nextFloat()*random.nextFloat())*3)+1));
        cavePath(random.nextLong(),column,cx,cz,x,y,z,radius,yaw,pitch,0,0,1);
      }
    }
  }
  return column;
}

function ravinePath(seed,column,cx,cz,x,y,z,radius,yaw,pitch) {
  const random=new JavaRandom(seed),length=112-random.nextInt(28),widths=new Float32Array(256);
  let factor=1,pitchTurn=0,yawTurn=0;
  for(let i=0;i<256;i++) {
    if(i===0||random.nextInt(3)===0)factor=f(1+f(random.nextFloat()*random.nextFloat()));
    widths[i]=f(factor*factor);
  }
  const centerX=cx*16+8,centerZ=cz*16+8;
  for(let t=0;t<length;t++) {
    let horizontal=1.5+f(sin189(f(f(t*PI)/length))*radius),vertical=horizontal*3;
    horizontal*=f(f(random.nextFloat()*.25)+.75);
    vertical*=f(f(random.nextFloat()*.25)+.75);
    const cp=cos189(pitch);
    x+=f(cos189(yaw)*cp);y+=sin189(pitch);z+=f(sin189(yaw)*cp);
    pitch=f(pitch*f(.7));
    pitch=f(pitch+f(pitchTurn*f(.05)));yaw=f(yaw+f(yawTurn*f(.05)));
    pitchTurn=f(pitchTurn*f(.8));yawTurn=f(yawTurn*f(.5));
    pitchTurn=f(pitchTurn+f(f(f(random.nextFloat()-random.nextFloat())*random.nextFloat())*2));
    yawTurn=f(yawTurn+f(f(f(random.nextFloat()-random.nextFloat())*random.nextFloat())*4));
    if(random.nextInt(4)===0)continue;
    const dx=x-centerX,dz=z-centerZ,left=length-t,reach=radius+2+16;
    if(dx*dx+dz*dz-left*left>reach*reach)return;
    if(x<centerX-16-horizontal*2||x>centerX+16+horizontal*2||z<centerZ-16-horizontal*2||z>centerZ+16+horizontal*2)continue;
    ellipsoid(column,cx,cz,x,y,z,horizontal,vertical,widths);
  }
}
export function carveRavines189(seed,cx,cz,column) {
  const random=new JavaRandom(seed),xSeed=random.nextLong(),zSeed=random.nextLong();
  for(let ox=cx-8;ox<=cx+8;ox++)for(let oz=cz-8;oz<=cz+8;oz++) {
    random.setSeed(BigInt.asIntN(64,BigInt(ox)*xSeed^BigInt(oz)*zSeed^seed));
    if(random.nextInt(50)!==0)continue;
    const x=ox*16+random.nextInt(16),y=random.nextInt(random.nextInt(40)+8)+20,z=oz*16+random.nextInt(16);
    const yaw=f(f(random.nextFloat()*PI)*2),pitch=f(f(f(random.nextFloat()-.5)*2)/8);
    const radius=f(f(f(random.nextFloat()*2)+random.nextFloat())*2);
    ravinePath(random.nextLong(),column,cx,cz,x,y,z,radius,yaw,pitch);
  }
  return column;
}
