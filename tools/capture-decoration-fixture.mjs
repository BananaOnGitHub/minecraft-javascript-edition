// Run the independent black-box probe in a disposable server world. The user's
// installed server and accepted EULA are supplied explicitly and left intact.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

const [jjsArg,jarArg,eulaArg,outputArg,mode="double"]=process.argv.slice(2);
if(!outputArg)throw new Error('Usage: node tools/capture-decoration-fixture.mjs JJS SERVER_JAR ACCEPTED_EULA OUTPUT_GZIP [MODE]');
const jar=resolve(jarArg),output=resolve(outputArg);
const biomeCapture=mode.startsWith('biomes');
const eula=await readFile(resolve(eulaArg),'utf8');
if(!/^eula=true\s*$/m.test(eula))throw new Error('Supply an already accepted EULA.');
const probe=fileURLToPath(new URL('./probe-decoration.js',import.meta.url));
const auxiliaryProbe=fileURLToPath(new URL(mode==='oak-limb'?'./probe-oak-limb.js':mode==='population-readiness'?'./probe-population-readiness.js':mode==='population-prefix'?'./probe-population-prefix.js':mode==='natural-lakes'?'./probe-natural-lakes.js':mode==='biome-climate'?'./probe-biome-climate.js':mode==='climate-edges'?'./probe-climate-edges.js':mode==='snow-support'?'./probe-snow-support.js':mode==='freeze-pass'?'./probe-freeze-pass.js':mode==='freeze-services'?'./probe-freeze.js':mode==='lakes'?'./probe-lake.js':mode==='population-seed'?'./probe-population-seed.js':mode==='lighting-timing'?'./probe-lighting-timing.js':mode==='world-services'?'./probe-world-services.js':'./probe-biome-decoration.js',import.meta.url));
const work=await mkdtemp(join(tmpdir(),'bigoak-reference-'));
let log='',child;
try {
  await writeFile(join(work,'eula.txt'),eula);
  await writeFile(join(work,'server.properties'),[
    'server-ip=127.0.0.1','server-port=0','online-mode=false','snooper-enabled=false',
    'level-name=world','level-seed=7','level-type=DEFAULT','generate-structures=true',
    'allow-nether=false','view-distance=2','gamemode=1','max-tick-time=-1',
  ].join('\n')+'\n');
  const capture=join(work,'result.json.gz');
  child=spawn(resolve(jjsArg),['-J-Xms256M',biomeCapture?'-J-Xmx1536M':'-J-Xmx768M',
    '-J-Dlog4j.configurationFile='+join(dirname(jar),'log4j2_17-111.xml'),
    '-J-Dlog4j2.formatMsgNoLookups=true','-J-Djava.class.path='+jar,probe,'--',capture,mode,auxiliaryProbe],
  {cwd:work,stdio:['pipe','pipe','pipe']});
  const exited=once(child,'exit');
  let stopping=false;
  const collect=bytes=>{
    log+=bytes;
    if(biomeCapture)for(const line of String(bytes).split('\n'))if(line.startsWith('BIOME '))console.log(line);
    if(!stopping&&log.includes('Done (')) {stopping=true;child.stdin.write('stop\n');}
  };
  child.stdout.on('data',collect);child.stderr.on('data',collect);
  const timer=setTimeout(()=>child.kill('SIGKILL'),biomeCapture?600000:mode==='fluids'||mode==='lakes'||mode==='natural-lakes'?300000:60000);
  let code;
  try { [code]=await exited; } finally { clearTimeout(timer); }
  if(code!==0)throw new Error('Reference server failed: '+log.slice(-2500));
  let bytes;
  try { bytes=await readFile(capture); } catch(error) { throw new Error("Reference capture missing: "+log.slice(-3500),{cause:error}); }
  const fixture=JSON.parse(gunzipSync(bytes));
  if(fixture.cases?.length!==(mode==='oak-limb'?6:mode==='population-readiness'?6:mode==='population-prefix'?4:mode==='natural-lakes'?8:mode==='biome-climate'?1:mode==='climate-edges'?8:mode==='snow-support'?4:mode==='freeze-pass'?12:mode==='freeze-services'?48:mode==='lakes'?48:mode==='population-seed'?5:mode==='lighting-timing'?8:mode==='world-services'?20:mode==='biomes-extra'?22:mode==='biomes'?118:mode==='fluids'?180:mode==="patches"?48:mode==="aquatic"?24:mode==="reeds"?12:mode==="deposits"?18:mode==="grass"?18:mode==="plants"?36:mode==="vines"?12:mode==="mushrooms"?36:mode==="springs"?48:mode==="icepatch"?12:mode==="wells"?12:mode==="giant"?24:mode==="spikes"?12:mode==="boulders"?12:54))throw new Error('Incomplete numerical capture: '+log.slice(-2500));
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  fixture.reference='Local unmodified Minecraft Java 1.8.9, isolated '+mode+' behavioral observations';
  fixture.serverSha256=hash(await readFile(jar));
  fixture.probeSha256=hash(await readFile(probe));
  if(biomeCapture||mode==='world-services'||mode==='lighting-timing'||mode==='population-seed'||mode==='lakes'||mode==='freeze-services'||mode==='freeze-pass'||mode==='snow-support'||mode==='climate-edges'||mode==='biome-climate'||mode==='natural-lakes'||mode==='population-prefix'||mode==='population-readiness'||mode==='oak-limb')fixture.auxiliaryProbeSha256=hash(await readFile(auxiliaryProbe));
  if(mode==='lighting-timing')fixture.inputSha256=hash(await readFile(new URL('./fixtures/lighting-canopy-input.json',import.meta.url)));
  await writeFile(output,gzipSync(JSON.stringify(fixture)+'\n'),{flag:'wx'});
  console.log('Captured',fixture.cases.length,'decoration cases to',output);
} finally {
  if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  await rm(work,{recursive:true,force:true});
}
