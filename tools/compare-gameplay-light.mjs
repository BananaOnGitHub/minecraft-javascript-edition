// Reproducible numerical report; no native observations enter production code.
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {gameplayLight189} from '../client/js/local-world/generation/v1_8_9/gameplay-light.js';
const f=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-gameplay-light.json.gz',import.meta.url))));
const report={reference:f.reference,seed:f.cases[0].seed,cases:[],naturalSkyChangedByMaintenance:0,samples:0,skyMismatches:0,blockMismatches:0};
for(const c of f.cases){
  if(c.seed)report.naturalSkyChangedByMaintenance+=c.initial.reduce((n,p,i)=>n+Number(p[4]!==c.maintained[i][4]),0);
  const cols=new Map(c.columns.map(col=>{const states=new Uint16Array(65536);
    for(const s of col.sections){let i=s.sy*4096;for(let r=0;r<s.runs.length;r+=2){states.fill(s.runs[r],i,i+s.runs[r+1]);i+=s.runs[r+1];}}
    return [`${col.x},${col.z}`,{states,biomes:new Uint8Array(256)}];}));
  for(const stage of ['settled','edited']){
    if(!c[stage])continue;
    const edits=new Map();if(stage==='edited')for(const [x,y,z,s]of c.editChanges){const k=`${x>>4},${z>>4}`;if(!edits.has(k))edits.set(k,new Map());edits.get(k).set(y*256+(z&15)*16+(x&15),s);}
    const start=performance.now(),a=gameplayLight189(c.x,c.z,(x,z)=>cols.get(`${x},${z}`),edits);
    const result={name:c.name,stage,x:c.x,z:c.z,samples:c[stage].length,skyMismatches:0,blockMismatches:0,firstDifference:null};
    for(const [x,y,z,s,sky,block]of c[stage]){const i=y*256+z*16+x,actualSky=a.skyLight[i>>1]>>((i&1)*4)&15,actualBlock=a.blockLight[i>>1]>>((i&1)*4)&15;
      result.skyMismatches+=Number(actualSky!==sky);result.blockMismatches+=Number(actualBlock!==block);
      if(!result.firstDifference&&(actualSky!==sky||actualBlock!==block))result.firstDifference={x:c.x*16+x,y,z:c.z*16+z,expected:[sky,block],actual:[actualSky,actualBlock]};
    }
    report.samples+=result.samples;report.skyMismatches+=result.skyMismatches;report.blockMismatches+=result.blockMismatches;report.cases.push(result);
    console.log(c.name,stage,result.skyMismatches,result.blockMismatches,`${(performance.now()-start).toFixed(1)} ms`);
  }
}
await writeFile(new URL('./fixtures/gameplay-light-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log('Total',report.samples,'sky mismatches',report.skyMismatches,'block mismatches',report.blockMismatches);
if(report.skyMismatches||report.blockMismatches)process.exitCode=1;
