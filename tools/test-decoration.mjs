import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { test } from 'node:test';
import { JavaRandom } from '../client/js/local-world/java-random.js';
import { generateDoublePlant189 } from '../client/js/local-world/generation/v1_8_9/decoration.js';

test('double plants match isolated native placements and caller RNG', async () => {
  const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-decoration.json.gz',import.meta.url))));
  const cases=fixture.cases.filter(c=>c.kind==='double');
  for(const c of cases) {
    const blocks=new Map(), key=(x,y,z)=>`${x},${y},${z}`;
    const world={get:(x,y,z)=>blocks.get(key(x,y,z))??(y<63?16:y===63?c.surface:0),
      set:(x,y,z,state)=>blocks.set(key(x,y,z),state)};
    const random=new JavaRandom(BigInt(c.seed));
    const actual=generateDoublePlant189(world,random,c.ox,c.oy,c.oz,c.variant);
    assert.equal(actual,c.ok,JSON.stringify(c));
    assert.equal(random.nextInt(),c.rngAfter);
    const list=[];
    for(let y=55;y<80;y++)for(let dz=-8;dz<=8;dz++)for(let dx=-8;dx<=8;dx++) {
      const state=world.get(c.ox+dx,y,c.oz+dz),base=y<63?16:y===63?c.surface:0;
      if(state!==base)list.push([dx,y-c.oy,dz,state]);
    }
    assert.deepEqual(list,c.blocks,`seed ${c.seed}, surface ${c.surface}, y ${c.oy}`);
  }
  assert.equal(cases.length,54);
});
