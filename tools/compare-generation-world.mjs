// Diagnostic comparison: reference light observations are compared, never injected.
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {JavaRandom} from '../client/js/local-world/java-random.js';
import {GenerationWorld189} from '../client/js/local-world/generation/v1_8_9/generation-world.js';
import {BiomeDecoration189} from '../client/js/local-world/generation/v1_8_9/biome-decoration.js';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export async function compareGenerationWorld() {
  const report={datasets:[]};
  for(const file of ['vanilla-189-biome-decoration','vanilla-189-biome-decoration-extra']) {
    const f=JSON.parse(gunzipSync(await readFile(new URL(`./fixtures/${file}.json.gz`,import.meta.url)))),result={file,evaluated:0,matched:0,total:f.cases.length,changedStatesMatched:0,featureRngCallsCompared:0,worldRngCallsCompared:0,finalRngValuePairsCompared:0,lightingQueriesCompared:0,lightingValuesMatched:0,blockStateInvocationsMatched:0,rngInvocationsMatched:0,differences:[],firstDifference:null};
    const decorator=new BiomeDecoration189();
    for(const c of f.cases) {
      result.evaluated++;
      const sections=new Map();for(const s of c.input??[]){const a=new Uint16Array(4096);let p=0;for(let i=0;i<s.runs.length;i+=2){a.fill(s.runs[i],p,p+s.runs[i+1]);p+=s.runs[i+1];}sections.set(s.section,a);}
      const base=(x,y,z)=>{
        if(!c.input)return y<63?16:y===63?(c.surface??32):0;
        const dx=(x>>4)-(c.x>>4),dz=(z>>4)-(c.z>>4),si=((dz+1)*4+dx+1)*16+(y>>4);
        return sections.get(si)?.[((y&15)<<8)|((z&15)<<4)|(x&15)]??0;
      };
      const calls=[],worldCalls=[];
      class Traced extends JavaRandom {
        constructor(seed,log){super(seed);this.log=log;}
        nextInt(b){this.log.push(['nextInt',b??null]);const value=super.nextInt(b);this.onDraw?.();return value;}
        nextFloat(){this.log.push(['nextFloat']);return super.nextFloat();}
        nextDouble(){this.log.push(['nextDouble']);return super.nextDouble();}
        nextLong(){this.log.push(['nextLong']);return super.nextLong();}
        nextBoolean(){this.log.push(['nextBoolean']);return super.nextBoolean();}
      }
      const r=new Traced(BigInt(c.seed),calls),wr=new Traced(BigInt(c.worldSeed),worldCalls);
      const world=new GenerationWorld189({random:wr,minChunkX:(c.x>>4)-1,maxChunkX:(c.x>>4)+2,minChunkZ:(c.z>>4)-1,maxChunkZ:(c.z>>4)+2,
        loadColumn:(cx,cz)=>{const a=new Uint16Array(65536);for(let y=0;y<256;y++)for(let z=0;z<16;z++)for(let x=0;x<16;x++)a[(y<<8)|(z<<4)|x]=base(cx*16+x,y,cz*16+z);return a;}});
      let lightMismatch=null;
      const lightChecks=new Map((c.mushrooms??[]).flatMap(m=>m.checks.map(q=>[q.after,q])));
      // Observe at the native post-draw boundary, including candidates that later
      // fail occupancy checks. Expected light never participates in placement.
      r.onDraw=()=>{
        const q=lightChecks.get(calls.length);if(!q)return;
        const {x,y,z}=q,neighbor=world.lightFromNeighbors(x,y,z),raw=world.getLight(x,y,z);
        result.lightingQueriesCompared++;
        if(neighbor===q.light)result.lightingValuesMatched++;
        if(raw===q.rawLight)result.lightingValuesMatched++;
        if(neighbor!==q.light&&!lightMismatch)lightMismatch={kind:'neighbor',call:calls.length,x,y,z,actual:neighbor,native:q.light};
        if(raw!==q.rawLight&&!lightMismatch)lightMismatch={kind:'raw',call:calls.length,x,y,z,actual:raw,native:q.rawLight};
      };
      try {
        decorator.decorate(world,r,c.biome,c.x,c.z,{fluids:world.fluids});
        const rng=r.nextInt(),worldRng=wr.nextInt();
        const expectedCalls=c.calls.map(i=>f.traceTypes[i].slice(0,-1));let first=-1;
        for(let i=0;i<Math.max(calls.length,expectedCalls.length);i++)if(JSON.stringify(calls[i])!==JSON.stringify(expectedCalls[i])){first=i;break;}
        const expected=new Map(c.blocks.map(([x,y,z,s])=>[`${c.x+x},${y},${c.z+z}`,s]));
        let blockMismatch=null;for(const k of new Set([...expected.keys(),...world.changes.keys()])){const [x,y,z]=k.split(',').map(Number),a=world.get(x,y,z),b=expected.get(k)??base(x,y,z);if(a!==b){blockMismatch={x,y,z,actual:a,native:b};break;}}
        const expectedWorldCalls=c.worldCalls.map(i=>f.traceTypes[i].slice(0,-1));
        const worldTraceMatches=JSON.stringify(worldCalls)===JSON.stringify(expectedWorldCalls);
        if(first>=0||rng!==c.rngAfter||worldRng!==c.worldRngAfter||!worldTraceMatches||blockMismatch||lightMismatch) {
          const difference={biome:c.biome,seed:c.seed,terrain:c.terrain,lightMismatch,blockMismatch,rngCall:first,actualCall:calls[first],nativeCall:expectedCalls[first],worldTraceMatches,featureRngActual:rng,featureRngNative:c.rngAfter,worldRngActual:worldRng,worldRngNative:c.worldRngAfter};result.firstDifference??=difference;result.differences.push(difference);
        } else result.matched++;
        if(!blockMismatch){result.blockStateInvocationsMatched++;result.changedStatesMatched+=c.blocks.length;}
        if(first<0&&rng===c.rngAfter&&worldRng===c.worldRngAfter&&worldTraceMatches)result.rngInvocationsMatched++;
        result.featureRngCallsCompared+=calls.length-1;
        result.worldRngCallsCompared+=worldCalls.length-1;
        result.finalRngValuePairsCompared++;
      } catch(e){const difference={biome:c.biome,seed:c.seed,error:e.message};result.firstDifference??=difference;result.differences.push(difference);}
    }
    report.datasets.push(result);
  }
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const report=await compareGenerationWorld();
  if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if(report.datasets.some(r=>r.firstDifference))process.exitCode=1;
}
