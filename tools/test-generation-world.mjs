import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {GenerationWorld189} from '../client/js/local-world/generation/v1_8_9/generation-world.js';
import {JavaRandom} from '../client/js/local-world/java-random.js';
import {BLOCK_PROPERTIES_189} from '../client/js/local-world/generation/v1_8_9/block-properties.js';

test('generation services match native incremental writes and queries',async()=>{
  const f=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-world-services.json.gz',import.meta.url))));
  assert.deepEqual(BLOCK_PROPERTIES_189,f.palette);
  for(const c of f.cases) {
    const world=new GenerationWorld189({random:new JavaRandom(7n),minChunkX:(c.x>>4)-2,maxChunkX:(c.x>>4)+2,minChunkZ:(c.z>>4)-2,maxChunkZ:(c.z>>4)+2,
      loadColumn:()=>{const a=new Uint16Array(65536);a.fill(16,0,63*256);a.fill(32,63*256,64*256);return a;}});
    for(let step=0;step<c.snapshots.length;step++) {
      if(step){const [x,y,z,s]=c.edits[step-1];world.set(c.x+x,y,c.z+z,s);}
      for(const [dx,dz,h,top] of c.snapshots[step].heights) {
        assert.equal(world.height(c.x+dx,c.z+dz),h,`${c.name} ${step} height`);
        assert.equal(world.topSolidOrLiquid(c.x+dx,c.z+dz),top,`${c.name} ${step} top`);
      }
      for(const [dx,y,dz,sky,block,light] of c.snapshots[step].points) {
        const x=c.x+dx,z=c.z+dz,label=`${c.name} step ${step} ${dx},${y},${dz}`;
        assert.deepEqual([world.getSkyLight(x,y,z),world.getBlockLight(x,y,z),world.lightFromNeighbors(x,y,z)],[sky,block,light],label);
      }
    }
  }
});
