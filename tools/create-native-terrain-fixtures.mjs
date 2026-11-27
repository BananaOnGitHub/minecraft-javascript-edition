import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

const [jarArg, javaArg, classesArg, eulaArg, outputArg, ...seeds] = process.argv.slice(2);
if (!outputArg || !seeds.length) throw new Error('Usage: node tools/create-native-terrain-fixtures.mjs SERVER_JAR JAVA_EXECUTABLE COMPILED_FIXTURE_CLASSES ACCEPTED_EULA_FILE NEW_OUTPUT_DIRECTORY SEEDS...');
const jar=resolve(jarArg), java=resolve(javaArg), classes=resolve(classesArg), output=resolve(outputArg);
const eula=await readFile(resolve(eulaArg),'utf8');
if (!/^eula=true\s*$/m.test(eula)) throw new Error('An already accepted local EULA file is required.');
for (const seed of seeds) if (!/^-?\d+$/.test(seed) || BigInt.asIntN(64,BigInt(seed))!==BigInt(seed) || BigInt(seed)===0n) throw new Error('Pass nonzero resolved signed long seeds.');
await mkdir(output); // Refuse to overwrite an existing reference directory.
const serverSha256=createHash('sha256').update(await readFile(jar)).digest('hex');
for (const seed of seeds) {
  const directory=join(output,'seed-'+seed), file=join(directory,'terrain.json.gz');
  await mkdir(directory);
  await writeFile(join(directory,'eula.txt'),eula);
  await writeFile(join(directory,'server.properties'),[
    'server-ip=127.0.0.1','server-port=0','online-mode=false','snooper-enabled=false',
    'level-name=world','level-seed='+seed,'level-type=DEFAULT','generate-structures=true',
    'allow-nether=false','view-distance=2','gamemode=1','max-tick-time=-1',
  ].join('\n')+'\n');
  const child=spawn(java,['-Xms256M','-Xmx768M',
    '-Dlog4j.configurationFile='+join(dirname(jar),'log4j2_17-111.xml'),
    '-Dlog4j2.formatMsgNoLookups=true','-cp',classes+':'+jar,
    'VanillaTerrainFixture',file,seed],{cwd:directory,stdio:['pipe','pipe','pipe']});
  let log='';const exit=once(child,'exit');
  try {
    await new Promise((resolve,reject) => {
      const timer=setTimeout(()=>reject(new Error('Server preparation timed out')),60000);
      const check=bytes=>{ log+=bytes; if(log.includes('Done (')){clearTimeout(timer);resolve();} };
      child.stdout.on('data',check);child.stderr.on('data',check);
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server preparation exit '+code));});
    });
    child.stdin.write('save-all\nstop\n');
    const [code]=await exit;
    if(code!==0) throw new Error('Server exit '+code);
    const fixture=JSON.parse(gunzipSync(await readFile(file)));
    if(fixture.seed!==seed || fixture.columns.length!==8) throw new Error('Incomplete native fixture');
    fixture.serverSha256=serverSha256;
    fixture.reference='Local unmodified Minecraft Java 1.8.9 Default provider, before population';
    await writeFile(file,gzipSync(JSON.stringify(fixture)+'\n'));
    console.log('Captured native seed',seed,'columns',fixture.columns.length);
  } finally {
    if(child.exitCode===null) {child.kill('SIGTERM');await exit;}
    await writeFile(join(directory,'reference.log'),log);
  }
}
