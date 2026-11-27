import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { test } from 'node:test';
import { JavaRandom } from '../client/js/local-world/java-random.js';
import { generateDoublePlant189 } from '../client/js/local-world/generation/v1_8_9/decoration.js';

test('springs match all isolated native propagation states and caller RNG', async () => {
  const {generateSpring189}=await import('../client/js/local-world/generation/v1_8_9/decoration.js');
  const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-decoration-springs.json.gz',import.meta.url))));
  for(const c of fixture.cases) {
    const blocks=new Map(),key=(x,y,z)=>`${x},${y},${z}`;
    const base=(x,y,z)=>{
      const dx=x-c.ox,dz=z-c.oz;
      const stone=(dx===0&&dz===0&&(y===c.oy-1||y===c.oy+1))||(y===c.oy&&((dx===-1&&dz===0)||(dx===0&&dz===-1)||(c.variant!==1&&dx===0&&dz===1)||(c.variant===2&&dx===1&&dz===0)||(c.variant===3&&dx===0&&dz===0)));
      return stone?16:y<63?16:y===63?c.surface:0;
    };
    const world={random:new JavaRandom(7n),get:(x,y,z)=>blocks.get(key(x,y,z))??base(x,y,z),set:(x,y,z,s)=>blocks.set(key(x,y,z),s)};
    const random=new JavaRandom(BigInt(c.seed));
    const label=`${c.liquid} seed=${c.seed}, y=${c.oy}, shape=${c.variant}`;
    assert.equal(generateSpring189(world,random,c.ox,c.oy,c.oz,c.liquid==='flowing_water'?'water':'lava'),c.ok,label);
    assert.equal(random.nextInt(),c.rngAfter,`${label} RNG`);
    const actual=[];
    for(let y=55;y<80;y++)for(let dz=-8;dz<=8;dz++)for(let dx=-8;dx<=8;dx++) {
      const state=world.get(c.ox+dx,y,c.oz+dz);
      if(state!==base(c.ox+dx,y,c.oz+dz))actual.push([dx,y-c.oy,dz,state]);
    }
    assert.deepEqual(actual,c.blocks,label);
  }
  assert.equal(fixture.cases.length,48);
});

test('immediate fluids match native paths, obstacles, contacts, metadata and both RNG streams', async () => {
  const {FluidUpdates189,blocksFluidMovement189}=await import('../client/js/local-world/generation/v1_8_9/fluids.js');
  const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-fluid-updates.json.gz',import.meta.url))));
  assert.equal(fixture.materialMovement.length,198);
  for(const [id,expected] of fixture.materialMovement)assert.equal(blocksFluidMovement189(id<<4),expected,`material ${id}`);
  class TracedRandom extends JavaRandom {
    constructor(seed){super(BigInt(seed));this.calls=[];}
    nextInt(bound){this.calls.push(['nextInt',bound??null]);return super.nextInt(bound);}
    nextFloat(){this.calls.push(['nextFloat']);return super.nextFloat();}
    nextDouble(){this.calls.push(['nextDouble']);return super.nextDouble();}
  }
  for(const c of fixture.cases) {
    const key=(x,y,z)=>`${x},${y},${z}`,initial=new Map(c.initial.map(([x,y,z,s])=>[key(c.ox+x,c.oy+y,c.oz+z),s])),blocks=new Map();
    const base=(x,y,z)=>initial.get(key(x,y,z))??(y<63?16:y===63?c.surface:0);
    const worldRandom=new TracedRandom(c.worldSeed),random=new TracedRandom(c.seed);
    const world={get:(x,y,z)=>blocks.get(key(x,y,z))??base(x,y,z),set:(x,y,z,s)=>blocks.set(key(x,y,z),s)};
    const updates=new FluidUpdates189(world,worldRandom);
    updates.runImmediate(()=>updates.tick(c.ox,c.oy,c.oz,random));
    const actual=[];
    for(let y=55;y<80;y++)for(let dz=-c.radius;dz<=c.radius;dz++)for(let dx=-c.radius;dx<=c.radius;dx++) {
      const s=world.get(c.ox+dx,y,c.oz+dz);
      if(s!==base(c.ox+dx,y,c.oz+dz))actual.push([dx,y-c.oy,dz,s]);
    }
    const label=`${c.liquid} ${c.scenario} seed=${c.seed} y=${c.oy}`;
    assert.deepEqual(actual,c.blocks,`${label} states`);
    assert.equal(random.nextInt(),c.rngAfter,`${label} caller RNG`);
    assert.equal(worldRandom.nextInt(),c.worldRngAfter,`${label} world RNG`);
    assert.deepEqual(random.calls,c.callerCalls,`${label} caller RNG calls`);
    assert.deepEqual(worldRandom.calls,c.worldCalls,`${label} world RNG calls`);
  }
  assert.equal(fixture.cases.length,180);
});

test('fluid scheduling stays deferred outside an exception-safe immediate scope', async () => {
  const {FluidUpdates189}=await import('../client/js/local-world/generation/v1_8_9/fluids.js');
  const blocks=new Map(),key=(x,y,z)=>`${x},${y},${z}`;
  const world={get:(x,y,z)=>blocks.get(key(x,y,z))??(y<64?16:0),set:(x,y,z,s)=>blocks.set(key(x,y,z),s)};
  const updates=new FluidUpdates189(world,new JavaRandom(1n));
  updates.set(15,64,-1,128,false);
  assert.deepEqual(updates.scheduled,[{x:15,y:64,z:-1,block:8,delay:5}]);
  assert.equal(blocks.size,1,'a scheduled request does not advance time');
  updates.runImmediate(()=>updates.tick(15,64,-1));
  assert.equal(world.get(15,64,-1),144);
  assert.equal(world.get(16,64,-1),145);
  assert.equal(updates.scheduled.length,1,'immediate work does not drain earlier scheduled requests');
  assert.equal(updates.immediate,false);
  const error=new Error('host failure');
  assert.throws(()=>updates.runImmediate(()=>{
    updates.runImmediate(()=>assert.equal(updates.immediate,true));
    assert.equal(updates.immediate,true);
    throw error;
  }),error);
  assert.equal(updates.immediate,false);
  const unloaded=new FluidUpdates189(world,new JavaRandom(1n),{isLoaded:()=>false});
  world.set(0,72,0,128);
  unloaded.runImmediate(()=>unloaded.request(0,72,0,'water'));
  assert.equal(world.get(0,72,0),128,'the host loaded-area gate prevents immediate ticks');
  assert.deepEqual(unloaded.scheduled,[]);
  world.set(100,64,0,31<<4);
  assert.throws(()=>updates.flow(100,64,0,'water',1),/requires a host displace callback/);
  assert.equal(world.get(100,64,0),31<<4,'unsupported destruction is not silently replaced');
  const displaced=[],notifications=[];
  const hosted=new FluidUpdates189(world,new JavaRandom(1n),{
    displace:(x,y,z,state,kind)=>displaced.push([x,y,z,state,kind]),
    neighborChanged:(x,y,z,source)=>notifications.push([x,y,z,source]),
  });
  hosted.flow(100,64,0,'water',1);
  assert.deepEqual(displaced,[[100,64,0,31<<4,'water']]);
  assert.equal(world.get(100,64,0),129);
  assert.equal(notifications.length,6);
  assert.ok(notifications.every(n=>n[3].x===100&&n[3].y===64&&n[3].z===0));
});

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

test('underwater deposits match native placement and RNG', async () => {
  const {generateSedimentDeposit189}=await import('../client/js/local-world/generation/v1_8_9/decoration.js');
  const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-decoration-deposits.json.gz',import.meta.url))));
  for(const c of fixture.cases) {
    const blocks=new Map(),key=(x,y,z)=>`${x},${y},${z}`;
    const base=y=>y<63?(y>=60?48:16):y===63?144:0;
    const world={get:(x,y,z)=>blocks.get(key(x,y,z))??base(y),set:(x,y,z,s)=>blocks.set(key(x,y,z),s)};
    const r=new JavaRandom(BigInt(c.seed)),kind={'decorator-e':'clay','decorator-f':'sand','decorator-g':'gravel'}[c.kind];
    assert.equal(generateSedimentDeposit189(world,r,c.ox,c.oy,c.oz,kind),c.ok);
    assert.equal(r.nextInt(),c.rngAfter,`${kind} seed=${c.seed}`);
    const actual=[];for(let y=55;y<80;y++)for(let dz=-8;dz<=8;dz++)for(let dx=-8;dx<=8;dx++) {
      const s=world.get(c.ox+dx,y,c.oz+dz);if(s!==base(y))actual.push([dx,y-c.oy,dz,s]);
    }
    assert.deepEqual(actual,c.blocks,`${kind} seed=${c.seed}, y=${c.oy}`);
  }
  assert.equal(fixture.cases.length,18);
});

test('grass and fern patches match native placement and RNG', async () => {
  const {generateTallGrassPatch189}=await import('../client/js/local-world/generation/v1_8_9/decoration.js');
  const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-decoration-grass.json.gz',import.meta.url))));
  for(const c of fixture.cases) {
    const blocks=new Map(),key=(x,y,z)=>`${x},${y},${z}`,base=y=>y<63?16:y===63?c.surface:0;
    const world={get:(x,y,z)=>blocks.get(key(x,y,z))??base(y),set:(x,y,z,s)=>blocks.set(key(x,y,z),s)};
    const r=new JavaRandom(BigInt(c.seed));
    assert.equal(generateTallGrassPatch189(world,r,c.ox,c.oy,c.oz,c.variant),c.ok);
    assert.equal(r.nextInt(),c.rngAfter);
    const actual=[];for(let y=55;y<80;y++)for(let dz=-8;dz<=8;dz++)for(let dx=-8;dx<=8;dx++) {
      const s=world.get(c.ox+dx,y,c.oz+dz);if(s!==base(y))actual.push([dx,y-c.oy,dz,s]);
    }
    assert.deepEqual(actual,c.blocks,`variant=${c.variant}, seed=${c.seed}, surface=${c.surface}, y=${c.oy}`);
  }
  assert.equal(fixture.cases.length,18);
});

test('dead bushes, pumpkins and melons match native fixtures', async () => {
  const {generateDeadBushPatch189,generateFruitPatch189}=await import('../client/js/local-world/generation/v1_8_9/decoration.js');
  const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-decoration-plants.json.gz',import.meta.url))));
  for(const c of fixture.cases) {
    const blocks=new Map(),key=(x,y,z)=>`${x},${y},${z}`,base=y=>y<63?16:y===63?c.surface:0;
    const world={get:(x,y,z)=>blocks.get(key(x,y,z))??base(y),set:(x,y,z,s)=>blocks.set(key(x,y,z),s)};
    const r=new JavaRandom(BigInt(c.seed));
    const label=`${c.kind} seed=${c.seed}, surface=${c.surface}, y=${c.oy}`;
    const result=c.kind==='bush'?generateDeadBushPatch189(world,r,c.ox,c.oy,c.oz):generateFruitPatch189(world,r,c.ox,c.oy,c.oz,c.kind);
    assert.equal(result,c.ok,label);assert.equal(r.nextInt(),c.rngAfter,label+' RNG');
    const actual=[];for(let y=55;y<80;y++)for(let dz=-8;dz<=8;dz++)for(let dx=-8;dx<=8;dx++) {
      const s=world.get(c.ox+dx,y,c.oz+dz);if(s!==base(y))actual.push([dx,y-c.oy,dz,s]);
    }
    assert.deepEqual(actual,c.blocks,label);
  }
  assert.equal(fixture.cases.length,36);
});

test('vine columns match native placements and RNG against a chunk-edge wall', async () => {
  const {generateVines189}=await import('../client/js/local-world/generation/v1_8_9/decoration.js');
  const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-decoration-vines.json.gz',import.meta.url))));
  for(const c of fixture.cases) {
    const blocks=new Map(),key=(x,y,z)=>`${x},${y},${z}`;
    const base=(x,y)=>c.wall&&x===c.ox+1&&y>=64&&y<128?16:y<63?16:y===63?c.surface:0;
    const world={get:(x,y,z)=>blocks.get(key(x,y,z))??base(x,y),set:(x,y,z,s)=>blocks.set(key(x,y,z),s)};
    const random=new JavaRandom(BigInt(c.seed));
    assert.equal(generateVines189(world,random,c.ox,c.oy,c.oz,(w,x,y,z)=>w.get(x,y,z)===16),c.ok);
    assert.equal(random.nextInt(),c.rngAfter);
    const actual=[];for(let y=55;y<130;y++)for(let dz=-8;dz<=8;dz++)for(let dx=-8;dx<=8;dx++) {
      const s=world.get(c.ox+dx,y,c.oz+dz);if(s!==base(c.ox+dx,y))actual.push([dx,y-c.oy,dz,s]);
    }
    assert.deepEqual(actual,c.blocks,`seed=${c.seed}, wall=${c.wall}, y=${c.oy}`);
  }
  assert.equal(fixture.cases.length,12);
});

test('small mushrooms match native fixtures and caller RNG with explicit light predicate', async () => {
  const {generateSmallMushroomPatch189}=await import('../client/js/local-world/generation/v1_8_9/decoration.js');
  const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-decoration-mushrooms.json.gz',import.meta.url))));
  for(const c of fixture.cases) {
    const blocks=new Map(),key=(x,y,z)=>`${x},${y},${z}`,base=y=>y<63?16:y===63?c.surface:0;
    const world={get:(x,y,z)=>blocks.get(key(x,y,z))??base(y),set:(x,y,z,s)=>blocks.set(key(x,y,z),s)};
    const r=new JavaRandom(BigInt(c.seed)),kind=c.kind==='decorator-t'?'brown':'red';
    const canPlace=(w,x,y,z)=>w.get(x,y-1,z)===1760||w.get(x,y-1,z)===50;
    assert.equal(generateSmallMushroomPatch189(world,r,c.ox,c.oy,c.oz,kind,canPlace),c.ok);
    assert.equal(r.nextInt(),c.rngAfter);
    const actual=[];for(let y=55;y<80;y++)for(let dz=-8;dz<=8;dz++)for(let dx=-8;dx<=8;dx++) {
      const s=world.get(c.ox+dx,y,c.oz+dz);if(s!==base(y))actual.push([dx,y-c.oy,dz,s]);
    }
    assert.deepEqual(actual,c.blocks,`${kind} seed=${c.seed}, surface=${c.surface}, y=${c.oy}`);
  }
  assert.equal(fixture.cases.length,36);
  const previous=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-decoration-patches.json.gz',import.meta.url))));
  for(const c of previous.cases.filter(c=>['decorator-t','decorator-u'].includes(c.kind))) {
    const world={get:(x,y,z)=>y<63?16:y===63?c.surface:0,set:()=>assert.fail('Unexpected mushroom placement')};
    const r=new JavaRandom(BigInt(c.seed));
    assert.equal(generateSmallMushroomPatch189(world,r,c.ox,c.oy,c.oz,c.kind==='decorator-t'?'brown':'red',()=>false),c.ok);
    assert.equal(r.nextInt(),c.rngAfter);
    assert.equal(c.blocks.length,0);
  }
});

test('packed ice patches match native fixtures and RNG', async () => {
  const {generateIcePatch189}=await import('../client/js/local-world/generation/v1_8_9/decoration.js');
  const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-decoration-icepatch.json.gz',import.meta.url))));
  for(const c of fixture.cases) {
    const blocks=new Map(),key=(x,y,z)=>`${x},${y},${z}`,base=y=>y<63?16:y===63?c.surface:0;
    const world={get:(x,y,z)=>blocks.get(key(x,y,z))??base(y),set:(x,y,z,s)=>blocks.set(key(x,y,z),s)};
    const r=new JavaRandom(BigInt(c.seed));
    assert.equal(generateIcePatch189(world,r,c.ox,c.oy,c.oz),c.ok);assert.equal(r.nextInt(),c.rngAfter);
    const actual=[];for(let y=55;y<80;y++)for(let dz=-8;dz<=8;dz++)for(let dx=-8;dx<=8;dx++) {
      const s=world.get(c.ox+dx,y,c.oz+dz);if(s!==base(y))actual.push([dx,y-c.oy,dz,s]);
    }
    assert.deepEqual(actual,c.blocks,`seed=${c.seed}, surface=${c.surface}, y=${c.oy}`);
  }
  assert.equal(fixture.cases.length,12);
});

test('desert wells match native block states and RNG', async () => {
  const {generateDesertWell189}=await import('../client/js/local-world/generation/v1_8_9/decoration.js');
  const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-decoration-wells.json.gz',import.meta.url))));
  for(const c of fixture.cases) {
    const blocks=new Map(),key=(x,y,z)=>`${x},${y},${z}`,base=y=>y<63?16:y===63?c.surface:0;
    const world={get:(x,y,z)=>blocks.get(key(x,y,z))??base(y),set:(x,y,z,s)=>blocks.set(key(x,y,z),s)};
    const r=new JavaRandom(BigInt(c.seed));
    assert.equal(generateDesertWell189(world,r,c.ox,c.oy,c.oz),c.ok);assert.equal(r.nextInt(),c.rngAfter);
    const actual=[];for(let y=55;y<80;y++)for(let dz=-8;dz<=8;dz++)for(let dx=-8;dx<=8;dx++) {
      const s=world.get(c.ox+dx,y,c.oz+dz);if(s!==base(y))actual.push([dx,y-c.oy,dz,s]);
    }
    assert.deepEqual(actual,c.blocks,`seed=${c.seed}, surface=${c.surface}, y=${c.oy}`);
  }
  assert.equal(fixture.cases.length,12);
});

test('giant mushroom geometry and RNG match native fixtures', async () => {
  const {generateGiantMushroom189}=await import('../client/js/local-world/generation/v1_8_9/decoration.js');
  const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-decoration-giant.json.gz',import.meta.url))));
  for(const c of fixture.cases) {
    const blocks=new Map(),key=(x,y,z)=>`${x},${y},${z}`,base=y=>y<63?16:y===63?c.surface:0;
    const world={get:(x,y,z)=>blocks.get(key(x,y,z))??base(y),set:(x,y,z,s)=>blocks.set(key(x,y,z),s)};
    const r=new JavaRandom(BigInt(c.seed)),kind=c.liquid.startsWith('brown')?'brown':'red';
    assert.equal(generateGiantMushroom189(world,r,c.ox,c.oy,c.oz,kind),c.ok);assert.equal(r.nextInt(),c.rngAfter);
    const actual=[];for(let y=55;y<80;y++)for(let dz=-8;dz<=8;dz++)for(let dx=-8;dx<=8;dx++) {
      const s=world.get(c.ox+dx,y,c.oz+dz);if(s!==base(y))actual.push([dx,y-c.oy,dz,s]);
    }
    assert.deepEqual(actual,c.blocks,`${kind} seed=${c.seed}, surface=${c.surface}, y=${c.oy}`);
  }
  assert.equal(fixture.cases.length,24);
});

test('ice spikes match native fixtures and RNG', async () => {
  const {generateIceSpike189}=await import('../client/js/local-world/generation/v1_8_9/decoration.js');
  const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-decoration-spikes.json.gz',import.meta.url))));
  for(const c of fixture.cases) {
    const blocks=new Map(),key=(x,y,z)=>`${x},${y},${z}`,base=y=>y<63?16:y===63?c.surface:0;
    const world={get:(x,y,z)=>blocks.get(key(x,y,z))??base(y),set:(x,y,z,s)=>blocks.set(key(x,y,z),s)};
    const r=new JavaRandom(BigInt(c.seed));assert.equal(generateIceSpike189(world,r,c.ox,c.oy,c.oz),c.ok);
    assert.equal(r.nextInt(),c.rngAfter,`RNG seed=${c.seed} surface=${c.surface}`);
    const actual=[];for(let y=55;y<160;y++)for(let dz=-8;dz<=8;dz++)for(let dx=-8;dx<=8;dx++) {
      const s=world.get(c.ox+dx,y,c.oz+dz);if(s!==base(y))actual.push([dx,y-c.oy,dz,s]);
    }
    assert.deepEqual(actual,c.blocks,`seed=${c.seed}, surface=${c.surface}, y=${c.oy}`);
  }
  assert.equal(fixture.cases.length,12);
});

test('mossy boulders match native block states and RNG', async () => {
  const {generateMossyBoulder189}=await import('../client/js/local-world/generation/v1_8_9/decoration.js');
  const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/vanilla-189-decoration-boulders.json.gz',import.meta.url))));
  for(const c of fixture.cases) {
    const blocks=new Map(),key=(x,y,z)=>`${x},${y},${z}`,base=y=>y<63?16:y===63?c.surface:0;
    const world={get:(x,y,z)=>blocks.get(key(x,y,z))??base(y),set:(x,y,z,s)=>blocks.set(key(x,y,z),s)};
    const r=new JavaRandom(BigInt(c.seed));assert.equal(generateMossyBoulder189(world,r,c.ox,c.oy,c.oz),c.ok);
    assert.equal(r.nextInt(),c.rngAfter,`RNG seed=${c.seed}`);
    const actual=[];for(let y=55;y<80;y++)for(let dz=-8;dz<=8;dz++)for(let dx=-8;dx<=8;dx++) {
      const s=world.get(c.ox+dx,y,c.oz+dz);if(s!==base(y))actual.push([dx,y-c.oy,dz,s]);
    }
    assert.deepEqual(actual,c.blocks,`seed=${c.seed}, surface=${c.surface}, y=${c.oy}`);
  }
  assert.equal(fixture.cases.length,12);
});
