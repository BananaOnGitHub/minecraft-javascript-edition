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
if(!outputArg)throw new Error('Usage: node tools/capture-big-oak-fixture.mjs JJS SERVER_JAR ACCEPTED_EULA OUTPUT_GZIP');
const jar=resolve(jarArg),output=resolve(outputArg);
const eula=await readFile(resolve(eulaArg),'utf8');
if(!/^eula=true\s*$/m.test(eula))throw new Error('Supply an already accepted EULA.');
const probe=fileURLToPath(new URL('./probe-decoration.js',import.meta.url));
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
  child=spawn(resolve(jjsArg),['-J-Xms256M','-J-Xmx768M',
    '-J-Dlog4j.configurationFile='+join(dirname(jar),'log4j2_17-111.xml'),
    '-J-Dlog4j2.formatMsgNoLookups=true','-J-Djava.class.path='+jar,probe,'--',capture,mode],
  {cwd:work,stdio:['pipe','pipe','pipe']});
  const exited=once(child,'exit');
  let stopping=false;
  const collect=bytes=>{
    log+=bytes;
    if(!stopping&&log.includes('Done (')) {stopping=true;child.stdin.write('stop\n');}
  };
  child.stdout.on('data',collect);child.stderr.on('data',collect);
  const timer=setTimeout(()=>child.kill('SIGKILL'),60000);
  let code;
  try { [code]=await exited; } finally { clearTimeout(timer); }
  if(code!==0)throw new Error('Reference server failed: '+log.slice(-2500));
  const fixture=JSON.parse(gunzipSync(await readFile(capture)));
  if(fixture.cases?.length!==(mode==="patches"?48:mode==="aquatic"?24:mode==="reeds"?12:54))throw new Error('Incomplete numerical capture: '+log.slice(-2500));
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  fixture.reference='Local unmodified Minecraft Java 1.8.9, isolated double plant features';
  fixture.serverSha256=hash(await readFile(jar));
  fixture.probeSha256=hash(await readFile(probe));
  await writeFile(output,gzipSync(JSON.stringify(fixture)+'\n'),{flag:'wx'});
  console.log('Captured',fixture.cases.length,'decoration cases to',output);
} finally {
  if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  await rm(work,{recursive:true,force:true});
}
