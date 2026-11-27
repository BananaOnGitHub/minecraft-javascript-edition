import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {test} from 'node:test';
import {JavaRandom} from '../client/js/local-world/java-random.js';
import {BiomeDecoration189} from '../client/js/local-world/generation/v1_8_9/biome-decoration.js';
import {blocksFluidMovement189} from '../client/js/local-world/generation/v1_8_9/fluids.js';

class TraceRandom extends JavaRandom {
  constructor(seed){super(BigInt(seed));this.calls=[];}
  nextInt(bound){this.calls.push(['nextInt',bound??null]);return super.nextInt(bound);}
  nextFloat(){this.calls.push(['nextFloat']);return super.nextFloat();}
  nextDouble(){this.calls.push(['nextDouble']);return super.nextDouble();}
  nextLong(){this.calls.push(['nextLong']);return super.nextLong();}
  nextBoolean(){this.calls.push(['nextBoolean']);return super.nextBoolean();}
}

test('complete biome invocations match native RNG boundaries and changed states',async()=>{
  const path=process.env.BIOME_FIXTURE??new URL('./fixtures/vanilla-189-biome-decoration.json.gz',import.meta.url);
  const fixture=JSON.parse(gunzipSync(await readFile(path))),events=[];
  let activeRandom,lightingBoundary=()=>{};
  const decorator=new BiomeDecoration189({observe:e=>{if(e.phase==='before'){events.push({...e,callIndex:activeRandom.calls.length});lightingBoundary(e);}}});
  for(const c of fixture.cases) {
    const calls=c.calls.map(i=>fixture.traceTypes[i]),worldCalls=c.worldCalls.map(i=>fixture.traceTypes[i]);
    const blocks=new Map(),key=(x,y,z)=>`${x},${y},${z}`,r=new TraceRandom(c.seed),wr=new TraceRandom(c.worldSeed);
    let light=new Map((c.light??[]).map(([x,y,z,l])=>[key(c.x+x,y,c.z+z),l]));
    let mushroomBoundary=null;
    const base=(x,y,z)=>y<0||y>=256?0:y<63?16:y===63?32:0;
    const world={random:wr,get:(x,y,z)=>blocks.get(key(x,y,z))??base(x,y,z),set:(x,y,z,s)=>{if(y>=0&&y<256)blocks.set(key(x,y,z),s);},
      height:(x,z)=>{for(let y=255;y>=0;y--)if(world.get(x,y,z)!==0&&!nonHeight.has(world.get(x,y,z)>>4))return y+1;return 0;},
      topSolidOrLiquid:(x,z)=>{for(let y=255;y>=0;y--){const s=world.get(x,y,z),id=s>>4;if(![18,161].includes(id)&&(blocksFluidMovement189(s)||[8,9,10,11].includes(id)))return y+1;}return 0;},
      isOpaque:s=>s!==0&&blocksFluidMovement189(s)&&![18,161,20,95,79].includes(s>>4),
      isFullCube:blocksFluidMovement189,
      canAttachVine:(w,x,y,z)=>world.isOpaque(world.get(x,y,z)),
      canPlace:(s,x,y,z)=>{
        const below=world.get(x,y-1,z),id=s>>4;
        if(id===39||id===40) {
          const query=mushroomBoundary?.checks?.find(q=>q.after===r.calls.length);
          if(query)assert.deepEqual([x,y,z],[query.x,query.y,query.z],'native environment query coordinates');
          return (below>>4)===110||below===50||((query?.light??light.get(key(x,y,z))??15)<13&&world.isOpaque(below));
        }
        return [2,3,60].includes(below>>4)&&(light.get(key(x,y,z))??15)>=8;
      },
    };
    events.length=0;activeRandom=r;
    lightingBoundary=e=>{
      if(e.kind!=='mushroom'||!c.mushrooms)return;
      const captured=c.mushrooms.find(m=>m.start===r.calls.length);
      assert.ok(captured,`missing mushroom boundary biome ${c.biome}, call ${r.calls.length}`);
      assert.deepEqual([e.x,e.y,e.z,e.variant],[captured.x,captured.y,captured.z,captured.variant]);
      mushroomBoundary=captured;
      light=new Map(captured.light.map(([x,y,z,l])=>[key(e.x+x,e.y+y,e.z+z),l]));
    };
    decorator.decorate(world,r,c.biome,c.x,c.z);
    const rngAfter=r.nextInt(),worldRngAfter=wr.nextInt();
    const label=`biome ${c.biome} seed ${c.seed}`;
    const treeDiff=c.blocks.filter(([x,y,z,s])=>[17,18,161,162].includes(s>>4)&&world.get(c.x+x,y,c.z+z)!==s).slice(0,8).map(([x,y,z,s])=>[x,y,z,world.get(c.x+x,y,c.z+z),s]);
    let i=0;
    for(;i<Math.max(r.calls.length,calls.length);i++)if(JSON.stringify(r.calls[i])!==JSON.stringify(calls[i]?.slice(0,-1)))break;
    assert.equal(i,Math.max(r.calls.length,calls.length),`${label} tree differences ${JSON.stringify(treeDiff)} first RNG divergence ${i}: actual ${JSON.stringify(r.calls[i])}, native ${JSON.stringify(calls[i])}; recent features ${JSON.stringify(events.filter(e=>e.callIndex<=i).slice(-4))}`);
    assert.equal(rngAfter,c.rngAfter,`${label} feature RNG value`);
    assert.equal(worldRngAfter,c.worldRngAfter,`${label} world RNG value`);
    assert.equal(wr.calls.length,worldCalls.length,`${label} world RNG call count`);
    assert.deepEqual(wr.calls,worldCalls.map(v=>v.slice(0,-1)),`${label} world RNG`);
    const actual=[];
    for(const [k,s] of blocks){const [x,y,z]=k.split(',').map(Number);if(s!==base(x,y,z))actual.push([x-c.x,y,z-c.z,s]);}
    const sort=(a,b)=>a[2]-b[2]||a[0]-b[0]||a[1]-b[1];
    const expected=[...c.blocks];actual.sort(sort);expected.sort(sort);
    if(JSON.stringify(actual)!==JSON.stringify(expected)) {
      const exp=new Map(expected.map(b=>[b.slice(0,3).join(','),b[3]])),act=new Map(actual.map(b=>[b.slice(0,3).join(','),b[3]]));
      const differences=[...new Set([...exp.keys(),...act.keys()])].filter(k=>exp.get(k)!==act.get(k)).slice(0,12).map(k=>[k,act.get(k),exp.get(k)]);
      assert.fail(`${label}: states ${actual.length}/${expected.length}; first differences [position,actual,native]: ${JSON.stringify(differences)}`);
    }
  }
  assert.equal(fixture.cases.length,118);
});

const nonHeight=new Set([6,27,28,30,31,32,37,38,39,40,50,51,55,59,65,66,69,75,76,77,83,93,94,104,105,106,111,115,127,131,132,140,141,142,143,149,150,157,171,175]);
