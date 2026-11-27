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

test('isolated flower and cactus patches match native placement and RNG', async () => {
  const {generateFlowerPatch189,generateCactusPatch189}=await import('../client/js/local-world/generation/v1_8_9/decoration.js');
  const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-decoration-patches.json.gz',import.meta.url))));
  const cases=fixture.cases.filter(c=>['decorator-s','decorator-x'].includes(c.kind));
  for(const c of cases) {
    const blocks=new Map(),key=(x,y,z)=>`${x},${y},${z}`;
    const world={get:(x,y,z)=>blocks.get(key(x,y,z))??(y<63?16:y===63?c.surface:0),set:(x,y,z,s)=>blocks.set(key(x,y,z),s)};
    const r=new JavaRandom(BigInt(c.seed));
    const ok=c.kind==='decorator-s'?generateFlowerPatch189(world,r,c.ox,c.oy,c.oz,c.blocks[0]?.[3]??(38<<4),(w,x,y,z)=>[2,3,60].includes(w.get(x,y-1,z)>>4)):
      generateCactusPatch189(world,r,c.ox,c.oy,c.oz,s=>s!==0&&![37,38,81].includes(s>>4));
    assert.equal(ok,c.ok,`${c.kind} ${c.seed}`);assert.equal(r.nextInt(),c.rngAfter,`${c.kind} RNG ${c.seed} ${c.surface} ${c.oy}`);
    const actual=[];for(let y=55;y<80;y++)for(let dz=-8;dz<=8;dz++)for(let dx=-8;dx<=8;dx++) {
      const s=world.get(c.ox+dx,y,c.oz+dz),base=y<63?16:y===63?c.surface:0;
      if(s!==base)actual.push([dx,y-c.oy,dz,s]);
    }
    assert.deepEqual(actual,c.blocks,`${c.kind} seed=${c.seed}, surface=${c.surface}, y=${c.oy}`);
  }
  assert.equal(cases.length,24);
});

test('water lily patches match native block positions and RNG, including failed attempts', async () => {
  const {generateWaterLilyPatch189}=await import('../client/js/local-world/generation/v1_8_9/decoration.js');
  const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-decoration-aquatic.json.gz',import.meta.url))));
  const cases=fixture.cases.filter(c=>c.kind==='decorator-y');
  for(const c of cases) {
    const blocks=new Map(),key=(x,y,z)=>`${x},${y},${z}`;
    const world={get:(x,y,z)=>blocks.get(key(x,y,z))??(y<63?16:y===63?c.surface:0),set:(x,y,z,s)=>blocks.set(key(x,y,z),s)};
    const r=new JavaRandom(BigInt(c.seed));
    assert.equal(generateWaterLilyPatch189(world,r,c.ox,c.oy,c.oz),c.ok);
    assert.equal(r.nextInt(),c.rngAfter);
    const actual=[];for(let y=55;y<80;y++)for(let dz=-8;dz<=8;dz++)for(let dx=-8;dx<=8;dx++) {
      const s=world.get(c.ox+dx,y,c.oz+dz),base=y<63?16:y===63?c.surface:0;
      if(s!==base)actual.push([dx,y-c.oy,dz,s]);
    }
    assert.deepEqual(actual,c.blocks,`seed=${c.seed}, surface=${c.surface}, y=${c.oy}`);
  }
  assert.equal(cases.length,12);
});

test('sugar cane matches native growth and RNG beside water', async () => {
  const {generateSugarCanePatch189}=await import('../client/js/local-world/generation/v1_8_9/decoration.js');
  const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-decoration-reeds.json.gz',import.meta.url))));
  for(const c of fixture.cases) {
    const blocks=new Map(),key=(x,y,z)=>`${x},${y},${z}`;
    const base=(x,y)=>y<63?16:y===63?((x&3)===0?144:c.surface):0;
    const world={get:(x,y,z)=>blocks.get(key(x,y,z))??base(x,y),set:(x,y,z,s)=>blocks.set(key(x,y,z),s)};
    const r=new JavaRandom(BigInt(c.seed));
    assert.equal(generateSugarCanePatch189(world,r,c.ox,c.oy,c.oz),c.ok);
    assert.equal(r.nextInt(),c.rngAfter,`seed=${c.seed}, surface=${c.surface}, y=${c.oy}`);
    const actual=[];for(let y=55;y<80;y++)for(let dz=-8;dz<=8;dz++)for(let dx=-8;dx<=8;dx++) {
      const s=world.get(c.ox+dx,y,c.oz+dz);if(s!==base(c.ox+dx,y))actual.push([dx,y-c.oy,dz,s]);
    }
    assert.deepEqual(actual,c.blocks,`seed=${c.seed}, surface=${c.surface}, y=${c.oy}`);
  }
  assert.equal(fixture.cases.length,12);
});
