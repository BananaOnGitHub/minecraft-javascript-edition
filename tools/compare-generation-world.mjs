// Diagnostic comparison: reference light observations are compared, never injected.
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {JavaRandom} from '../client/js/local-world/java-random.js';
import {GenerationWorld189} from '../client/js/local-world/generation/v1_8_9/generation-world.js';
import {BiomeDecoration189} from '../client/js/local-world/generation/v1_8_9/biome-decoration.js';
const report={datasets:[]};
for(const file of ['vanilla-189-biome-decoration','vanilla-189-biome-decoration-extra']) {
  const f=JSON.parse(gunzipSync(await readFile(new URL(`./fixtures/${file}.json.gz`,import.meta.url)))),result={file,matched:0,total:f.cases.length,firstDifference:null};
  const decorator=new BiomeDecoration189();
  for(const c of f.cases) {
    const sections=new Map();for(const s of c.input??[]){const a=new Uint16Array(4096);let p=0;for(let i=0;i<s.runs.length;i+=2){a.fill(s.runs[i],p,p+s.runs[i+1]);p+=s.runs[i+1];}sections.set(s.section,a);}
    const base=(x,y,z)=>{
      if(!c.input)return y<63?16:y===63?(c.surface??32):0;
      const dx=(x>>4)-(c.x>>4),dz=(z>>4)-(c.z>>4),si=((dz+1)*4+dx+1)*16+(y>>4);
      return sections.get(si)?.[((y&15)<<8)|((z&15)<<4)|(x&15)]??0;
    };
    let active=null;
    const calls=[];
    class Traced extends JavaRandom {
      nextInt(b){calls.push(['nextInt',b??null]);return super.nextInt(b);}
      nextFloat(){calls.push(['nextFloat']);return super.nextFloat();}
      nextDouble(){calls.push(['nextDouble']);return super.nextDouble();}
      nextLong(){calls.push(['nextLong']);return super.nextLong();}
      nextBoolean(){calls.push(['nextBoolean']);return super.nextBoolean();}
    }
    const r=new Traced(BigInt(c.seed)),wr=new JavaRandom(BigInt(c.worldSeed));
    const world=new GenerationWorld189({random:wr,minChunkX:(c.x>>4)-1,maxChunkX:(c.x>>4)+2,minChunkZ:(c.z>>4)-1,maxChunkZ:(c.z>>4)+2,
      loadColumn:(cx,cz)=>{const a=new Uint16Array(65536);for(let y=0;y<256;y++)for(let z=0;z<16;z++)for(let x=0;x<16;x++)a[(y<<8)|(z<<4)|x]=base(cx*16+x,y,cz*16+z);return a;}});
    decorator.observe=e=>{if(e.phase==='before'&&e.kind==='mushroom')active=c.mushrooms.find(m=>m.start===calls.length);};
    const canPlace=world.canPlace.bind(world);
    let lightMismatch=null;
    world.canPlace=(s,x,y,z)=>{
      if([39,40].includes(s>>4)) {
        const q=active?.checks.find(q=>q.after===calls.length);
        if(q&&world.lightFromNeighbors(x,y,z)!==q.light&&!lightMismatch)lightMismatch={call:calls.length,x,y,z,actual:world.lightFromNeighbors(x,y,z),native:q.light};
      }
      return canPlace(s,x,y,z);
    };
    try {
      decorator.decorate(world,r,c.biome,c.x,c.z,{fluids:world.fluids});
      const rng=r.nextInt(),worldRng=wr.nextInt();
      const expectedCalls=c.calls.map(i=>f.traceTypes[i].slice(0,-1));let first=-1;
      for(let i=0;i<Math.max(calls.length,expectedCalls.length);i++)if(JSON.stringify(calls[i])!==JSON.stringify(expectedCalls[i])){first=i;break;}
      const expected=new Map(c.blocks.map(([x,y,z,s])=>[`${c.x+x},${y},${c.z+z}`,s]));
      let blockMismatch=null;for(const k of new Set([...expected.keys(),...world.changes.keys()])){const [x,y,z]=k.split(',').map(Number),a=world.get(x,y,z),b=expected.get(k)??base(x,y,z);if(a!==b){blockMismatch={x,y,z,actual:a,native:b};break;}}
      if(first>=0||rng!==c.rngAfter||worldRng!==c.worldRngAfter||blockMismatch||lightMismatch) {
        result.firstDifference={biome:c.biome,seed:c.seed,terrain:c.terrain,lightMismatch,blockMismatch,rngCall:first,actualCall:calls[first],nativeCall:expectedCalls[first],worldRngActual:worldRng,worldRngNative:c.worldRngAfter};break;
      }
      result.matched++;
    } catch(e){result.firstDifference={biome:c.biome,seed:c.seed,error:e.message};break;}
  }
  report.datasets.push(result);
}
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(report.datasets.some(r=>r.firstDifference))process.exitCode=1;
