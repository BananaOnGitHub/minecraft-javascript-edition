import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { DefaultTerrain189 } from '../client/js/local-world/generation/v1_8_9/default.js';
import { compareColumns } from './anvil-reference.mjs';
import { carveCaves189, carveRavines189 } from '../client/js/local-world/generation/v1_8_9/carvers.js';

const [input,output] = process.argv.slice(2);
if(!input)throw new Error('Usage: node tools/compare-default-generation.mjs NATIVE_TERRAIN_JSON_GZ [REPORT_JSON]');
const fixture=JSON.parse(gunzipSync(await readFile(input)));
const generator=new DefaultTerrain189(fixture.seed);
const expand=(runs,ArrayType=Uint16Array) => ArrayType.from(runs.flatMap((v,i)=>i%2===0?Array(runs[i+1]).fill(v):[]));
const reports=[];
for(const c of fixture.columns) {
  const started=performance.now(),actual=generator.surfaceColumn(c.x,c.z);
  const biomes=expand(c.biomes,Uint8Array);
  const report={x:c.x,z:c.z,generationMilliseconds:performance.now()-started,
    density:{equal:0,total:c.density.length,maximumAbsoluteError:0},
    surface:compareColumns({states:expand(c.surface),biomes,populated:false},actual),
    populatedBlockStates:null};
  for(let i=0;i<c.density.length;i++) {
    report.density.equal+=+(actual.density[i]===c.density[i]);
    report.density.maximumAbsoluteError=Math.max(report.density.maximumAbsoluteError,Math.abs(actual.density[i]-c.density[i]));
  }
  let equal=0,total=0;
  const expected=expand(c.surface);
  for(let i=0;i<65536;i++)if(expected[i]!==0||actual.states[i]!==0) {
    total++;equal+=+(expected[i]===actual.states[i]);
  }
  report.surface.nonAirStates={equal,total,fraction:total?equal/total:null};
  let previous=actual.states.slice();
  for(const [name,carve] of [['caves',carveCaves189],['ravines',carveRavines189]]) {
    carve(generator.seed,c.x,c.z,actual);
    const reference=expand(c[name]);
    report[name]=compareColumns({states:reference,biomes,populated:false},actual);
    let changedEqual=0,changedTotal=0;
    for(let i=0;i<65536;i++)if(reference[i]!==previous[i]||actual.states[i]!==previous[i]) {
      changedTotal++;changedEqual+=+(reference[i]===actual.states[i]);
    }
    report[name].changedStates={equal:changedEqual,total:changedTotal,fraction:changedTotal?changedEqual/changedTotal:null};
    previous=actual.states.slice();
  }
  report.unpopulated={complete:false,remaining:'structures',
    comparison:compareColumns({states:expand(c.unpopulated),biomes,populated:false},actual)};
  report.generationMilliseconds=performance.now()-started;
  reports.push(report);
}
const metrics=['biomes','topNonAir','blockStates','nonAirStates','bottomBedrockMask'];
const summary={};
for(const name of metrics) {
  const equal=reports.reduce((s,r)=>s+r.surface[name].equal,0),total=reports.reduce((s,r)=>s+r.surface[name].total,0);
  summary[name]={equal,total,fraction:total?equal/total:null};
}
const densityEqual=reports.reduce((s,r)=>s+r.density.equal,0),densityTotal=reports.reduce((s,r)=>s+r.density.total,0);
summary.density={equal:densityEqual,total:densityTotal,fraction:densityEqual/densityTotal,
  maximumAbsoluteError:Math.max(...reports.map(r=>r.density.maximumAbsoluteError))};
for(const stage of ['caves','ravines']) {
  const equal=reports.reduce((s,r)=>s+r[stage].blockStates.equal,0),total=reports.length*65536;
  const changes=reports.reduce((s,r)=>s+r[stage].changedStates.total,0),matchingChanges=reports.reduce((s,r)=>s+r[stage].changedStates.equal,0);
  summary[stage]={equal,total,fraction:equal/total,changes,matchingChanges};
}
const json=JSON.stringify({generator:DefaultTerrain189.id,seed:fixture.seed,referenceSha256:fixture.serverSha256,
  stage:'carved, before structures or population',summary,columns:reports},null,2)+'\n';
if(output)await writeFile(output,json);
process.stdout.write(json);
if(Object.values(summary).some(m=>m.fraction!==1))process.exitCode=1;
