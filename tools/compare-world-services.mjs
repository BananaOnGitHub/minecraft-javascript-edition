import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {GenerationWorld189} from '../client/js/local-world/generation/v1_8_9/generation-world.js';
import {JavaRandom} from '../client/js/local-world/java-random.js';
const f=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-world-services-expanded.json.gz',import.meta.url))));
const report={matched:0,total:f.cases.length,cases:[]};
for(const c of f.cases) {
  const world=new GenerationWorld189({random:new JavaRandom(7n),minChunkX:(c.x>>4)-2,maxChunkX:(c.x>>4)+2,minChunkZ:(c.z>>4)-2,maxChunkZ:(c.z>>4)+2,
    loadColumn:()=>{const a=new Uint16Array(65536);a.fill(16,0,63*256);a.fill(32,63*256,64*256);return a;}});
  for(const [x,y,z,s]of c.initial)world.set(c.x+x,y,c.z+z,s);
  const result={name:c.name,x:c.x,z:c.z,firstDifference:null};
  for(let step=0;step<c.snapshots.length;step++) {
    if(step){const [x,y,z,s]=c.edits[step-1];world.set(c.x+x,y,c.z+z,s);}
    const snap=c.snapshots[step];
    const check=(kind,position,actual,native)=>{if(JSON.stringify(actual)!==JSON.stringify(native)&&!result.firstDifference)result.firstDifference={step,kind,position,actual,native};};
    for(const [dx,dz,h,t]of snap.heights)check('height',[dx,dz],[world.height(c.x+dx,c.z+dz),world.topSolidOrLiquid(c.x+dx,c.z+dz)],[h,t]);
    for(const [dx,y,dz,s,b,l]of snap.points)check('light',[dx,y,dz],[world.getSkyLight(c.x+dx,y,c.z+dz),world.getBlockLight(c.x+dx,y,c.z+dz),world.lightFromNeighbors(c.x+dx,y,c.z+dz)],[s,b,l]);
    for(const [dx,y,dz,s,expected]of snap.predicates??[])check('predicate',[dx,y,dz,s],world.canPlace(s,c.x+dx,y,c.z+dz),expected);
  }
  if(!result.firstDifference)report.matched++;
  report.cases.push(result);
}
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(report.matched!==report.total)process.exitCode=1;
