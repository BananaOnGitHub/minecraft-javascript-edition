import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Biomes189, GENERATOR_ID } from '../client/js/local-world/generation/v1_8_9/biomes.js';
import { parseJavaLong } from '../client/js/local-world/java-random.js';
import { readAnvilColumn } from './anvil-reference.mjs';

const [world, seed, output] = process.argv.slice(2);
if (!world || parseJavaLong(seed) === null) throw new Error('Usage: node tools/compare-default-biomes.mjs WORLD_DIRECTORY RESOLVED_SEED [REPORT_JSON]');
const generator = new Biomes189(seed), directory = join(resolve(world),'region');
const report = { generator:GENERATOR_ID,seed,stage:'biomes',columns:0,unpopulated:0,
  equal:0,total:0,biomeIds:[],mismatches:[],heightmap:null,density:null,blockStates:null };
const ids = new Set();
const start = performance.now();
for (const name of (await readdir(directory)).filter(n => /^r\.-?\d+\.-?\d+\.mca$/.test(n)).sort()) {
  const [,rx,rz] = name.split('.'), path = join(directory,name), bytes = await readFile(path);
  if (bytes.length < 8192) throw new Error('Truncated Anvil header: '+name);
  for (let i=0;i<1024;i++) if (bytes.readUInt32BE(i*4)) {
    const x = Number(rx)*32+i%32, z = Number(rz)*32+Math.floor(i/32);
    const reference = await readAnvilColumn(path,x,z), actual = generator.sample(x*16,z*16,16,16);
    const equal = actual.reduce((sum,v,j) => sum+(v===reference.biomes[j]),0);
    report.columns++; report.unpopulated += !reference.populated;
    report.equal += equal; report.total += 256;
    reference.biomes.forEach(v => ids.add(v));
    if (equal !== 256) report.mismatches.push({x,z,equal,total:256});
  }
}
report.biomeIds = [...ids].sort((a,b) => a-b);
report.fraction = report.total ? report.equal/report.total : null;
report.milliseconds = performance.now()-start;
const json = JSON.stringify(report,null,2)+'\n';
if (output) await writeFile(output,json);
process.stdout.write(json);
if (report.mismatches.length || !report.total) process.exitCode=1;
