// Independently authored biome orchestration. MIT Glowstone populators informed
// feature families; local 1.8.9 numerical calls determine ordering and counts.
import {JavaRandom} from '../../java-random.js';
import {SimplexNoise189} from './noise.js';
import {STANDARD_ORES_189,generateMinable189,generateExtremeHillsOres189} from './ores.js';
import * as trees from './trees.js';
import * as plants from './decoration.js';
import {FluidUpdates189,blocksFluidMovement189} from './fluids.js';

const OVERWORLD=[...Array(40).keys()].filter(id=>id!==8&&id!==9).concat([129,130,131,132,133,134,140,149,151,155,156,157,158,160,161,162,163,164,165,166,167]);
const DELEGATE=new Map([[130,2],[133,5],[134,6],[149,21],[151,23],[157,29],[158,30]]);
const FOREST=new Set([4,18,27,28,29,132,155,156]);
const TAIGA=new Set([5,19,30,31,32,33,160,161]);
const JUNGLE=new Set([21,22,23]);
const HILLS=new Set([3,20,34,131,162]);
const MESA=new Set([37,38,39,165,166,167]);
const flowerNoise=new SimplexNoise189(new JavaRandom(2345n));
export function decorationCounts189(id) {
  if(!OVERWORLD.includes(id))throw new RangeError('Not a registered 1.8.9 Overworld biome');
  id=DELEGATE.get(id)??id;
  const c={trees:0,flowers:2,grass:1,deadBushes:0,mushrooms:0,reeds:0,cacti:0,sand:3,clay:1,gravel:1,lilies:0,giantMushrooms:0};
  if([1,129,16,25,26].includes(id))c.trees=-999;
  if([2,17].includes(id))Object.assign(c,{trees:-999,deadBushes:2,reeds:50,cacti:10});
  if(FOREST.has(id))Object.assign(c,{trees:id===29?-999:id===132?6:10,grass:id===132?1:2,flowers:id===132?100:2});
  if(TAIGA.has(id))Object.assign(c,{trees:10,mushrooms:[32,33,160,161].includes(id)?3:1,grass:[32,33,160,161].includes(id)?7:1,deadBushes:[32,33,160,161].includes(id)?1:0});
  if(id===6)Object.assign(c,{trees:2,flowers:1,grass:5,deadBushes:1,mushrooms:8,reeds:10,sand:0,gravel:0,lilies:4});
  if([14,15].includes(id))Object.assign(c,{trees:-100,flowers:-100,grass:-100,mushrooms:1,giantMushrooms:1});
  if([20,34].includes(id))c.trees=3;
  if(JUNGLE.has(id))Object.assign(c,{trees:id===23?2:50,flowers:4,grass:25});
  if([35,36].includes(id))Object.assign(c,{trees:1,flowers:4,grass:20});
  if([163,164].includes(id))Object.assign(c,{trees:2,grass:5});
  if(MESA.has(id))Object.assign(c,{trees:[38,166].includes(id)?5:-999,flowers:0,deadBushes:20,reeds:3,cacti:5});
  if([1,129].includes(id))Object.assign(c,{flowers:4,grass:10});
  return c;
}

export function selectFlower189(id,random,x,z) {
  if(id===6)return (38<<4)|1;
  if(id===132) {
    const t=Math.max(0,Math.min(0.9999,(1+flowerNoise.sample(x/48,z/48))/2));
    let i=Math.floor(t*10);if(i===2)i=1;
    return i===0?37<<4:(38<<4)|(i-1);
  }
  if([1,129].includes(id)) {
    if(flowerNoise.sample(x/200,z/200)<-0.8)return (38<<4)|(4+random.nextInt(4));
    if(random.nextInt(3)>0)return (38<<4)|[0,3,8][random.nextInt(3)];
    return 37<<4;
  }
  return random.nextInt(3)>0?37<<4:38<<4;
}

// Instance owns retained per-biome large oaks, never a module-wide singleton.
export class BiomeDecoration189 {
  constructor({observe=()=>{}}={}) {this.bigOaks=new Map();this.giantKinds=new Map();this.observe=observe;}
  feature(kind,random,x,y,z,run,details={}) {
    const event={kind,x,y,z,...details};
    this.observe({...event,phase:'before',rng:random.seed?.toString()});
    const result=run();
    this.observe({...event,phase:'after',rng:random.seed?.toString(),result});
    return result;
  }
  tree(id,world,r,x,y,z) {
    let kind='oak',options=[];
    if(FOREST.has(id)) {
      if(id===29&&r.nextInt(3)>0)kind='canopy';
      else if([155,156].includes(id))kind=r.nextBoolean()?'tall-birch':'birch';
      else if([27,28].includes(id)||r.nextInt(5)===0)kind='birch';
    } else if([155,156].includes(id))kind='tall-birch';
    else if(TAIGA.has(id)) {
      if([32,33,160,161].includes(id)&&r.nextInt(3)===0)kind=[160,161].includes(id)||r.nextInt(13)===0?'mega-spruce':'mega-pine';
      else kind=r.nextInt(3)===0?'taiga1':'taiga2';
    } else if(JUNGLE.has(id)) {
      if(r.nextInt(10)===0)kind='big-oak';
      else if(r.nextInt(2)===0)kind='shrub';
      else if(id!==23&&r.nextInt(3)===0)kind='mega-jungle';
      else {kind='jungle';options=[4+r.nextInt(7),275,291,true];}
    } else if(HILLS.has(id)&&r.nextInt(3)>0)kind='taiga2';
    else if(id===6)kind='swamp';
    else if([12,13,140].includes(id))kind='taiga2';
    else if([35,36,163,164].includes(id))kind=r.nextInt(5)>0?'savanna':'oak';
    else if(!MESA.has(id)&&r.nextInt(10)===0)kind='big-oak';
    const call=()=>{
      switch(kind) {
        case 'big-oak': {
          let tree=this.bigOaks.get(id);if(!tree){tree=new trees.BigOakTree189();this.bigOaks.set(id,tree);}
          tree.prepare();
          return tree.generate(world,r,x,y,z);
        }
        case 'birch':case 'tall-birch':return trees.generateBirchTree189(world,r,x,y,z,kind==='tall-birch');
        case 'canopy':return trees.generateCanopyTree189(world,r,x,y,z);
        case 'taiga1':return trees.generateTaiga1Tree189(world,r,x,y,z);
        case 'taiga2':return trees.generateTaiga2Tree189(world,r,x,y,z);
        case 'mega-pine':case 'mega-spruce':return trees.generateMegaPineTree189(world,r,x,y,z,kind==='mega-spruce');
        case 'mega-jungle':return trees.generateMegaJungleTree189(world,r,x,y,z);
        case 'shrub':return trees.generateShrub189(world,r,x,y,z,275,288);
        case 'swamp':return trees.generateSwampTree189(world,r,x,y,z);
        case 'savanna':return trees.generateSavannaTree189(world,r,x,y,z);
        default:return trees.generateOakTree189(world,r,x,y,z,...options);
      }
    };
    const ok=this.feature('tree',r,x,y,z,call,{variant:kind});
    if(ok&&kind.startsWith('mega-')&&kind!=='mega-jungle')this.feature('podzol',r,x,y,z,()=>trees.generateMegaPinePodzol189(world,r,x,y,z));
    return ok;
  }
  decorate(world,random,biomeId,baseX,baseZ,{fluids=new FluidUpdates189(world)}={}) {
    if(![world.height,world.topSolidOrLiquid,world.canPlace,world.isOpaque,world.isFullCube,world.canAttachVine].every(v=>typeof v==='function'))throw new TypeError('Decoration world requires height, topSolidOrLiquid, canPlace, isOpaque, isFullCube and canAttachVine');
    const id=DELEGATE.get(biomeId)??biomeId,c=decorationCounts189(id),r=random;
    const prePost=![130,133,134,149,151,155,156,158].includes(biomeId);
    const at=(kind,x,y,z,fn,detail)=>this.feature(kind,r,x,y,z,fn,detail);
    const horizontal=()=>[baseX+r.nextInt(16)+8,baseZ+r.nextInt(16)+8];
    const scatter=(kind,n,fn,extra=0)=>{for(let i=0;i<n;i++){const [x,z]=horizontal(),y=r.nextInt(extra?world.height(x,z)+extra:world.height(x,z)*2);at(kind,x,y,z,()=>fn(x,y,z));}};
    const double=(variant,n)=>scatter('double-plant',n,(x,y,z)=>plants.generateDoublePlant189(world,r,x,y,z,variant),32);
    if([1,129].includes(id)) {
      if(flowerNoise.sample((baseX+8)/200,(baseZ+8)/200)<-0.8){c.flowers=15;c.grass=5;}
      else double(2,7);
      if(id===129)double(0,10);
    }
    if(prePost&&FOREST.has(id)) {
      if(id===29)for(let ix=0;ix<4;ix++)for(let iz=0;iz<4;iz++) {
        const x=baseX+ix*4+9+r.nextInt(3),z=baseZ+iz*4+9+r.nextInt(3),y=world.height(x,z);
        if(r.nextInt(20)===0)at('giant-mushroom',x,y,z,()=>plants.generateGiantMushroom189(world,r,x,y,z,r.nextBoolean()?'brown':'red',world.isOpaque));
        else this.tree(id,world,r,x,y,z);
      }
      let n=r.nextInt(5)-3;if(id===132)n+=2;
      for(let i=0;i<n;i++) {
        const variant=[1,4,5][r.nextInt(3)];
        for(let attempt=0;attempt<5;attempt++) {
          const [x,z]=horizontal(),y=r.nextInt(world.height(x,z)+32);
          if(at('double-plant',x,y,z,()=>plants.generateDoublePlant189(world,r,x,y,z,variant)))break;
        }
      }
    }
    if(prePost&&TAIGA.has(id)) {
      if([32,33,160,161].includes(id))for(let i=0,n=r.nextInt(3);i<n;i++){const [x,z]=horizontal(),y=world.height(x,z);at('boulder',x,y,z,()=>plants.generateMossyBoulder189(world,r,x,y,z));}
      double(3,7);
    }
    if([35,36].includes(id))double(2,7);
    if(id===140) {
      for(const [kind,n,fn] of [['ice-spike',3,plants.generateIceSpike189],['ice-patch',2,plants.generateIcePatch189]])
        for(let i=0;i<n;i++){const [x,z]=horizontal(),y=world.height(x,z);at(kind,x,y,z,()=>fn(world,r,x,y,z));}
    }
    for(const ore of STANDARD_ORES_189)for(let i=0;i<ore.count;i++) {
      const x=baseX+r.nextInt(16),y=ore.spread?r.nextInt(ore.spreadY)+r.nextInt(ore.spreadY)+ore.centerY-ore.spreadY:r.nextInt(ore.maxY-ore.minY)+ore.minY,z=baseZ+r.nextInt(16);
      at('ore',x,y,z,()=>generateMinable189(world,r,x,y,z,ore.state,ore.size),{state:ore.state});
    }
    for(const kind of ['sand','clay','gravel'])for(let i=0;i<c[kind];i++){const [x,z]=horizontal(),y=world.topSolidOrLiquid(x,z);at(kind,x,y,z,()=>plants.generateSedimentDeposit189(world,r,x,y,z,kind));}
    let treeCount=c.trees;if(r.nextInt(10)===0)treeCount++;
    for(let i=0;i<treeCount;i++){const [x,z]=horizontal();this.tree(id,world,r,x,world.height(x,z),z);}
    for(let i=0;i<c.giantMushrooms;i++) {
      const [x,z]=horizontal(),y=world.height(x,z);
      at('giant-mushroom',x,y,z,()=>{
        if(!this.giantKinds.has(id))this.giantKinds.set(id,r.nextBoolean()?'brown':'red');
        return plants.generateGiantMushroom189(world,r,x,y,z,this.giantKinds.get(id),world.isOpaque);
      });
    }
    scatter('flowers',c.flowers,(x,y,z)=>{const state=selectFlower189(biomeId,r,x,z);return plants.generateFlowerPatch189(world,r,x,y,z,state,(w,bx,by,bz,s)=>w.canPlace(s,bx,by,bz));},32);
    scatter('grass',c.grass,(x,y,z)=>plants.generateTallGrassPatch189(world,r,x,y,z,TAIGA.has(biomeId)?(r.nextInt(5)>0?2:1):JUNGLE.has(biomeId)?(r.nextInt(4)===0?2:1):1));
    scatter('dead-bush',c.deadBushes,(x,y,z)=>plants.generateDeadBushPatch189(world,r,x,y,z));
    scatter('lily',c.lilies,(x,y,z)=>{while(y>0&&world.get(x,y-1,z)===0)y--;return plants.generateWaterLilyPatch189(world,r,x,y,z);});
    const mushroom=(kind,x,y,z)=>at('mushroom',x,y,z,()=>plants.generateSmallMushroomPatch189(world,r,x,y,z,kind,(w,bx,by,bz,s)=>w.canPlace(s,bx,by,bz)),{variant:kind});
    for(let i=0;i<c.mushrooms;i++) {
      if(r.nextInt(4)===0){const [x,z]=horizontal();mushroom('brown',x,world.height(x,z),z);}
      if(r.nextInt(8)===0){const [x,z]=horizontal();mushroom('red',x,r.nextInt(world.height(x,z)*2),z);}
    }
    if(r.nextInt(4)===0){const [x,z]=horizontal();mushroom('brown',x,r.nextInt(world.height(x,z)*2),z);}
    if(r.nextInt(8)===0){const [x,z]=horizontal();mushroom('red',x,r.nextInt(world.height(x,z)*2),z);}
    scatter('reeds',c.reeds+10,(x,y,z)=>plants.generateSugarCanePatch189(world,r,x,y,z));
    if(r.nextInt(32)===0)scatter('pumpkin',1,(x,y,z)=>plants.generateFruitPatch189(world,r,x,y,z,'pumpkin'));
    scatter('cactus',c.cacti,(x,y,z)=>plants.generateCactusPatch189(world,r,x,y,z,blocksFluidMovement189));
    for(const [kind,n] of [['water',50],['lava',20]])for(let i=0;i<n;i++) {
      const [x,z]=horizontal(),y=kind==='water'?r.nextInt(r.nextInt(248)+8):r.nextInt(r.nextInt(r.nextInt(240)+8)+8);
      at('spring',x,y,z,()=>plants.generateSpring189(world,r,x,y,z,kind,fluids),{variant:kind});
    }
    if(HILLS.has(id))at('hills-ores',baseX,0,baseZ,()=>generateExtremeHillsOres189(world,r,baseX,baseZ));
    if(prePost&&[2,17].includes(id)&&r.nextInt(1000)===0){const [x,z]=horizontal(),y=world.height(x,z)+1;at('well',x,y,z,()=>plants.generateDesertWell189(world,r,x,y,z));}
    if(prePost&&JUNGLE.has(id)) {
      scatter('melon',1,(x,y,z)=>plants.generateFruitPatch189(world,r,x,y,z,'melon'));
      for(let i=0;i<50;i++){const [x,z]=horizontal();at('vines',x,128,z,()=>plants.generateVines189(world,r,x,128,z,world.canAttachVine));}
    }
    return {fluids};
  }
}
