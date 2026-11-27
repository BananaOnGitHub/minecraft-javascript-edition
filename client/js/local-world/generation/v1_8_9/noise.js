// Sampling loops adapted from Glowstone (MIT). See third-party/glowstone/LICENSE.
// Keep the legacy bulk sampler's Y-gradient cache and two-dimensional special
// case. Replacing these with independent point samples changes terrain.
const fade = t => t*t*t*(t*(t*6-15)+10);
const lerp = (t,a,b) => a+t*(b-a);
function grad(hash,x,y,z) {
  const h=hash&15, u=h<8?x:y, v=h<4?y:h===12||h===14?x:z;
  return ((h&1)===0?u:-u)+((h&2)===0?v:-v);
}
class Permutation {
  constructor(random) {
    this.x=random.nextDouble()*256;
    this.y=random.nextDouble()*256;
    this.z=random.nextDouble()*256;
    this.p=new Uint16Array(512);
    for(let i=0;i<256;i++)this.p[i]=i;
    for(let i=0;i<256;i++) {
      const j=i+random.nextInt(256-i), old=this.p[i];
      this.p[i]=this.p[j];this.p[j]=old;this.p[i+256]=this.p[i];
    }
  }
}
export class ImprovedNoise189 extends Permutation {
  add(out,x,y,z,nx,ny,nz,sx,sy,sz,divisor=1) {
    const p=this.p, amplitude=1/divisor;
    let index=0,previousY=-1,a=0,b=0,c=0,d=0;
    for(let i=0;i<nx;i++) {
      let dx=x+i*sx+this.x;
      const fx0=Math.floor(dx), ix=fx0&255;dx-=fx0;const fx=fade(dx);
      for(let j=0;j<nz;j++) {
        let dz=z+j*sz+this.z;
        const fz0=Math.floor(dz), iz=fz0&255;dz-=fz0;const fz=fade(dz);
        if(ny===1) {
          const aa=p[p[ix]]+iz,ba=p[p[ix+1]]+iz;
          a=lerp(fx,grad(p[aa],dx,0,dz),grad(p[ba],dx-1,0,dz));
          b=lerp(fx,grad(p[aa+1],dx,0,dz-1),grad(p[ba+1],dx-1,0,dz-1));
          out[index++]+=lerp(fz,a,b)*amplitude;
          continue;
        }
        for(let k=0;k<ny;k++) {
          let dy=y+k*sy+this.y;
          const fy0=Math.floor(dy),iy=fy0&255;dy-=fy0;const fy=fade(dy);
          if(k===0||iy!==previousY) {
            previousY=iy;
            const pa=p[ix]+iy,pb=p[ix+1]+iy;
            const aa=p[pa]+iz,ab=p[pa+1]+iz,ba=p[pb]+iz,bb=p[pb+1]+iz;
            a=lerp(fx,grad(p[aa],dx,dy,dz),grad(p[ba],dx-1,dy,dz));
            b=lerp(fx,grad(p[ab],dx,dy-1,dz),grad(p[bb],dx-1,dy-1,dz));
            c=lerp(fx,grad(p[aa+1],dx,dy,dz-1),grad(p[ba+1],dx-1,dy,dz-1));
            d=lerp(fx,grad(p[ab+1],dx,dy-1,dz-1),grad(p[bb+1],dx-1,dy-1,dz-1));
          }
          out[index++]+=lerp(fz,lerp(fy,a,b),lerp(fy,c,d))*amplitude;
        }
      }
    }
    return out;
  }
}
const gradients=[[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[1,0],[-1,0],[0,1],[0,-1],[0,1],[0,-1]];
const F2=0.5*(Math.sqrt(3)-1),G2=(3-Math.sqrt(3))/6;
// The legacy simplex floor returns -1 for zero and n-1 for negative integers.
const simplexFloor = v => v>0?Math.trunc(v):Math.trunc(v)-1;
export class SimplexNoise189 extends Permutation {
  sample(x,y) {
    const s=(x+y)*F2,i=simplexFloor(x+s),j=simplexFloor(y+s),t=(i+j)*G2;
    const x0=x-(i-t),y0=y-(j-t),i1=x0>y0?1:0,j1=x0>y0?0:1;
    const x1=x0-i1+G2,y1=y0-j1+G2,x2=x0-1+2*G2,y2=y0-1+2*G2;
    const ii=i&255,jj=j&255,p=this.p;
    const contribution=(hash,dx,dy) => {
      let t=0.5-dx*dx-dy*dy;
      if(t<0)return 0;
      const g=gradients[hash%12];t*=t;return t*t*(g[0]*dx+g[1]*dy);
    };
    return 70*(contribution(p[ii+p[jj]],x0,y0)+
      contribution(p[ii+i1+p[jj+j1]],x1,y1)+contribution(p[ii+1+p[jj+1]],x2,y2));
  }
  add(out,x,z,nx,nz,sx,sz,amplitude=1) {
    let index=0;
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++) {
      out[index++]+=this.sample((x+i)*sx+this.x,(z+j)*sz+this.y)*amplitude;
    }
    return out;
  }
}
export class PerlinOctaves189 {
  constructor(random,count) { this.octaves=Array.from({length:count},()=>new ImprovedNoise189(random)); }
  sample(x,y,z,nx,ny,nz,sx,sy,sz) {
    const out=new Float64Array(nx*ny*nz);
    let factor=1;
    for(const octave of this.octaves) {
      let dx=x*factor*sx,dz=z*factor*sz;
      const lx=Math.floor(dx),lz=Math.floor(dz);
      dx=dx-lx+lx%16777216;dz=dz-lz+lz%16777216;
      octave.add(out,dx,y*factor*sy,dz,nx,ny,nz,sx*factor,sy*factor,sz*factor,factor);
      factor/=2;
    }
    return out;
  }
}
export class SimplexOctaves189 {
  constructor(random,count) { this.octaves=Array.from({length:count},()=>new SimplexNoise189(random)); }
  sample(x,z,nx,nz,sx,sz,lacunarity,persistence=0.5) {
    const out=new Float64Array(nx*nz);
    let frequency=1,amplitude=1;
    for(const octave of this.octaves) {
      octave.add(out,x,z,nx,nz,sx*frequency*amplitude,sz*frequency*amplitude,0.55/amplitude);
      frequency*=lacunarity;amplitude*=persistence;
    }
    return out;
  }
}
