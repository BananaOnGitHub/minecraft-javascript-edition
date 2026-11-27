// Black-box numerical reference probe, using the supplied local 1.8.9 server.
// Runtime ABI names only; no game source or assets. Derived from the handoff probe.
var fixtureOutput = String(arguments[0]);
var featureMode = String(arguments[1] || "double");
var auxiliaryProbe = String(arguments[2] || '');
var randomAfterInt = null;
// Probe: re-capture big_oak for seeds 1, 2, 7 with correct world coords
// This reproduces the exact fixture conditions

var Thread = java.lang.Thread;
var Runtime = java.lang.Runtime;
var Random = java.util.Random;
var BlockPos = Java.type("cj");
var ServerClass = Java.type("net.minecraft.server.MinecraftServer");
// Initialize crash reporting before entering a shutdown hook, so a probe error
// cannot be hidden by Log4j trying to register a late JVM shutdown hook.
java.lang.Class.forName('b');

function bp(x, y, z) { return new BlockPos(x | 0, y | 0, z | 0); }

function makeRand(seed, calls) {
  var inner = new Random(seed);
  var ready = false;
  var R = Java.extend(Random, {
    setSeed: function(s) { if (ready) inner.setSeed(s); },
    nextInt: function(bound) {
      if(calls)calls.push(['nextInt',bound===undefined?null:Number(bound)]);
      var value=bound===undefined?inner.nextInt():inner.nextInt(bound);
      if(randomAfterInt)randomAfterInt(value,bound);
      return value;
    },
    nextFloat: function() { if(calls)calls.push(['nextFloat']);return inner.nextFloat(); },
    nextLong: function() { if(calls)calls.push(['nextLong']);return inner.nextLong(); },
    nextDouble: function() { if(calls)calls.push(['nextDouble']);return inner.nextDouble(); },
    nextBoolean: function() { if(calls)calls.push(['nextBoolean']);return inner.nextBoolean(); }
  });
  var r = new R();
  ready = true;
  return r;
}

Runtime.getRuntime().addShutdownHook(new Thread(function() {
  try {
    var lField = ServerClass.class.getDeclaredField("l");
    lField.setAccessible(true);
    var world = lField.get(null).d[0];
    var Ebs = Java.type("amz");
    var DoublePlant = Java.type("aos"); var Kind = Java.type("agi$b");

    function getEncoded(x, y, z) {
      var ch = world["a(int,int)"]((x >> 4) | 0, (z >> 4) | 0);
      var sec = ch.h()[(y >> 4) | 0];
      if (!sec) return 0;
      return String(sec.g()[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)]).charCodeAt(0);
    }

    function rawSet(x,y,z,state) {
      var ch=world['a(int,int)'](x>>4,z>>4),secs=ch.h(),sy=y>>4;
      if(!secs[sy])secs[sy]=new Ebs(sy*16,true);
      secs[sy].g()[((y&15)*256)+((z&15)*16)+(x&15)]=java.lang.Character.valueOf(String.fromCharCode(state));
      secs[sy].e();ch.b();
    }

    function setupGrass(cx0, cz0, surfaceY, surfaceCode) {
      for (var cx = cx0 - 2; cx <= cx0 + 2; cx++)
        for (var cz = cz0 - 2; cz <= cz0 + 2; cz++)
          {var loaded=world["a(int,int)"](cx | 0, cz | 0);
          if(featureMode.indexOf('biomes')===0){var populated=Java.type('amy').class.getDeclaredField('n');populated.setAccessible(true);populated.setBoolean(loaded,true);}}
      var stoneChar = java.lang.Character.valueOf('\u0010');
      var grassChar = java.lang.Character.valueOf(String.fromCharCode(surfaceCode));
      for (var cx = cx0 - 1; cx <= cx0 + 1; cx++) {
        for (var cz = cz0 - 1; cz <= cz0 + 1; cz++) {
          var ch = world["a(int,int)"](cx | 0, cz | 0);
          var secs = ch.h();
          for (var sy = 0; sy < 16; sy++) {
            var y0 = sy * 16;
            if (y0 > surfaceY) { secs[sy] = null; continue; }
            var sec = new Ebs(y0 | 0, true);
            for (var ly = 0; ly < 16; ly++) {
              var y = y0 + ly;
              if (y > surfaceY) continue;
              var chVal = y === surfaceY ? grassChar : stoneChar;
              java.util.Arrays.fill(sec.g(), (ly * 256) | 0, ((ly + 1) * 256) | 0, chVal);
            }
            sec.e();
            secs[sy] = sec;
          }
          ch.b();
        }
      }
    }

    if(featureMode.indexOf('biomes')===0||featureMode==='world-services'||featureMode==='lighting-timing'||featureMode==='population-seed'||featureMode==='lakes'||featureMode==='freeze-services'||featureMode==='freeze-pass'||featureMode==='snow-support'||featureMode==='climate-edges'||featureMode==='biome-climate'||featureMode==='natural-lakes') {
      load(auxiliaryProbe);
      var result=captureBiomeDecoration(world,setupGrass,getEncoded,rawSet,makeRand);
      var stream=new java.util.zip.GZIPOutputStream(new java.io.FileOutputStream(fixtureOutput));
      var writer=new java.io.PrintWriter(new java.io.OutputStreamWriter(stream,'UTF-8'));
      writer.print(JSON.stringify(result));writer.close();print('WROTE '+fixtureOutput);return;
    }
    var cases=[],materialMovement=[];
    if(featureMode==='fluids')for(var id=0;id<198;id++)materialMovement.push([id,Java.type('afh').c(id).t().c()]);
    var specs=[]; for(var variant=0;variant<6;variant++) specs.push({kind:"double",surface:32,variant:variant});
    specs.push({kind:"double",surface:16,variant:2});
    specs.push({kind:"double",surface:48,variant:2});
    specs.push({kind:"double",surface:960,variant:2});
    if(featureMode==="patches" || featureMode==="aquatic") {
      specs=[];var fields=featureMode==='aquatic'?['w','y']:['s','t','u','x'];
      for(var j=0;j<fields.length;j++)for(var k=0;k<2;k++)
        specs.push({kind:'decorator-'+fields[j],surface:featureMode==='aquatic'?(k===0?144:32):(k===0?32:192),variant:2});
    }
    if(featureMode==="reeds") specs=[{kind:'decorator-w',surface:32,variant:2,patterned:true},{kind:'decorator-w',surface:192,variant:2,patterned:true}];
    if(featureMode==="deposits") specs=['e','f','g'].map(function(n){return {kind:'decorator-'+n,surface:144,variant:2,deposit:true};});
    if(featureMode==="grass") specs=[{kind:'grass',surface:32,variant:1},{kind:'grass',surface:32,variant:2},{kind:'grass',surface:192,variant:1}];
    if(featureMode==="plants") {
      specs=[];for each(var name in ['bush','pumpkin','melon'])for each(var ground in [32,192])specs.push({kind:name,surface:ground,variant:0});
    }
    if(featureMode==="vines") specs=[{kind:'vines',surface:32,variant:0,wall:true},{kind:'vines',surface:32,variant:0,wall:false}];
    if(featureMode==="mushrooms") {specs=[];for each(var name in ['t','u'])for each(var ground in [1760,50,32])specs.push({kind:'decorator-'+name,surface:ground,variant:0});}
    if(featureMode==="springs") {specs=[];for each(var liquid in ['flowing_water','flowing_lava'])for(var shape=0;shape<4;shape++)specs.push({kind:'spring',surface:32,variant:shape,liquid:liquid});}
    if(featureMode==="icepatch") specs=[{kind:'icepatch',surface:1280,variant:4},{kind:'icepatch',surface:32,variant:4}];
    if(featureMode==="wells") specs=[{kind:'well',surface:192,variant:0},{kind:'well',surface:32,variant:0}];
    if(featureMode==="giant") {specs=[];for each(var mushroom in ['brown_mushroom_block','red_mushroom_block'])for each(var ground in [32,192])specs.push({kind:'giant',surface:ground,variant:0,liquid:mushroom});}
    if(featureMode==="spikes") specs=[{kind:'spike',surface:1280,variant:0},{kind:'spike',surface:32,variant:0}];
    if(featureMode==="boulders") specs=[{kind:'boulder',surface:32,variant:0},{kind:'boulder',surface:192,variant:0}];
    if(featureMode==='fluids') {
      specs=[];
      var scenarios=['source','level-five','decay','drain','channel','obstacle','source-pair','fed-above','contact-below','contact-source','contact-shallow','contact-deep','flower','sign','distant-drain'];
      for each(var liquid in ['flowing_water','flowing_lava'])for each(var scenario in scenarios)
        specs.push({kind:'fluid',surface:32,variant:0,liquid:liquid,scenario:scenario});
    }
    var decorator=Java.type('ady')['e(int)'](1).as;
    for(var si=0;si<specs.length;si++) for(var ji=0;ji<3;ji++) for(var hi=0;hi<2;hi++) {
      var spec=specs[si],seed=(featureMode==="spikes"?[1,7,88]:[1,7,12345])[ji],cx=400+si*12+ji*3,cz=400+hi*4;
      // Reuse six isolated arenas rather than retain thousands of chunks.
      if(featureMode==='fluids') {cx=-400-ji*3;cz=hi===0?-400:404;}
      setupGrass(cx,cz,63,spec.surface);
      if(spec.deposit) for(var ax=-1;ax<=1;ax++)for(var az=-1;az<=1;az++) {
        var ch=world["a(int,int)"](cx+ax,cz+az),section=ch.h()[3];
        for(var ly=12;ly<=14;ly++)java.util.Arrays.fill(section.g(),ly*256,(ly+1)*256,java.lang.Character.valueOf('\u0030'));
        section.e();ch.b();
      }
      if(spec.patterned) for(var ax=-1;ax<=1;ax++)for(var az=-1;az<=1;az++) {
        var ch=world["a(int,int)"](cx+ax,cz+az),section=ch.h()[3];
        for(var lz=0;lz<16;lz++)for(var lx=0;lx<16;lx++)
          if(((cx*16+ax*16+lx)&3)===0) section.g()[(15*256+lz*16+lx)]=java.lang.Character.valueOf('\u0090');
        section.e();ch.b();
      }
      var ox=cx*16+15,oy=spec.deposit?(hi===0?63:72):(hi===0?64:72),oz=cz*16+15;
      if(spec.wall)for(var wz=-1;wz<=1;wz++) {
        var wallChunk=world["a(int,int)"](cx+1,cz+wz),sections=wallChunk.h();
        for(var sy=4;sy<8;sy++) {
          var wallSection=new Ebs(sy*16,true);
          for(var ly=0;ly<16;ly++)for(var zz=0;zz<16;zz++)wallSection.g()[ly*256+zz*16]=java.lang.Character.valueOf('\u0010');
          wallSection.e();sections[sy]=wallSection;
        }
        wallChunk.b();
      }
      if(spec.kind==='spring') {
        var stonePositions=[[0,-1,0],[0,1,0],[-1,0,0],[0,0,-1],[0,0,1]];
        if(spec.variant===1)stonePositions.pop();
        if(spec.variant===2)stonePositions.push([1,0,0]);
        if(spec.variant===3)stonePositions.push([0,0,0]);
        for each(var pos in stonePositions) {
          var wx=ox+pos[0],wy=oy+pos[1],wz=oz+pos[2],ch=world["a(int,int)"](wx>>4,wz>>4),secs=ch.h(),sy=wy>>4;
          if(secs[sy]===null)secs[sy]=new Ebs(sy*16,true);
          secs[sy].g()[((wy&15)*256)+((wz&15)*16)+(wx&15)]=java.lang.Character.valueOf('\u0010');
          secs[sy].e();ch.b();
        }
      }
      var initial=[],worldCalls=[],callerCalls=[],worldSeed=9000+seed;
      if(spec.kind==='fluid') {
        var source=spec.liquid==='flowing_water'?128:160,other=source===128?176:144;
        initial.push([0,0,0,source]);
        if(spec.scenario==='level-five'||spec.scenario==='decay')initial[0][3]+=spec.scenario==='decay'?7:5;
        if(spec.scenario==='level-five')initial.push([-1,0,0,source+16+4]);
        if(spec.scenario==='drain')initial.push([1,63-oy,0,0]);
        if(spec.scenario==='channel')for(var dx=-7;dx<=7;dx++)for each(var dz in [-1,1])initial.push([dx,0,dz,16]);
        if(spec.scenario==='obstacle')for(var dz=-2;dz<=2;dz++)initial.push([1,0,dz,16]);
        if(spec.scenario==='source-pair') {initial[0][3]+=4;initial.push([-1,0,0,source+16],[1,0,0,source+16]);}
        if(spec.scenario==='fed-above') {initial[0][3]+=3;initial.push([0,1,0,source+16+2]);}
        if(spec.scenario==='contact-below')initial.push([0,-1,0,other]);
        if(spec.scenario==='contact-source'||spec.scenario==='contact-shallow'||spec.scenario==='contact-deep')initial.push([1,0,0,other+(spec.scenario==='contact-shallow'?4:spec.scenario==='contact-deep'?5:0)]);
        if(spec.scenario==='flower')initial.push([1,0,0,37<<4]);
        if(spec.scenario==='sign')initial.push([1,0,0,63<<4]);
        if(spec.scenario==='distant-drain')initial.push([4,63-oy,0,0],[-2,63-oy,0,0]);
        for each(var p in initial)rawSet(ox+p[0],oy+p[1],oz+p[2],p[3]);
        var worldRandomField=Java.type('adm').class.getDeclaredField('s');worldRandomField.setAccessible(true);
        var previousWorldRandom=worldRandomField.get(world);
        worldRandomField.set(world,makeRand(worldSeed,worldCalls));
      }
      var gen;
      if(spec.kind==='double') {gen=new DoublePlant();gen.a(Kind.values()[spec.variant]);}
      else if(spec.kind==='bush')gen=new (Java.type('aoq'))();
      else if(spec.kind==='pumpkin')gen=new (Java.type('apl'))();
      else if(spec.kind==='melon')gen=new (Java.type('aph'))();
      else if(spec.kind==='giant')gen=new (Java.type('aoz'))(Java.type('afh').b(spec.liquid));
      else if(spec.kind==='boulder')gen=new (Java.type('aok'))(Java.type('afh').b('mossy_cobblestone'),0);
      else if(spec.kind==='spike')gen=new (Java.type('apb'))();
      else if(spec.kind==='well')gen=new (Java.type('aor'))();
      else if(spec.kind==='icepatch')gen=new (Java.type('apa'))(4);
      else if(spec.kind==='spring')gen=new (Java.type('apr'))(Java.type('afh').b(spec.liquid));
      else if(spec.kind==='vines')gen=new (Java.type('apw'))();
      else if(spec.kind==='grass')gen=new (Java.type('apu'))(Java.type('akc$a').values()[spec.variant]);
      else if(spec.kind!=='fluid') {var field=decorator.getClass().getDeclaredField(spec.kind.slice(10));field.setAccessible(true);gen=field.get(decorator);}
      var random=makeRand(seed,spec.kind==='fluid'?callerCalls:null),ok;
      if(spec.kind==='fluid') {
        var immediateField=Java.type('adm').class.getDeclaredField('e');immediateField.setAccessible(true);
        var previousImmediate=immediateField.getBoolean(world);immediateField.setBoolean(world,true);
        try {Java.type('afh').c(initial[0][3]>>4).b(world,bp(ox,oy,oz),world.p(bp(ox,oy,oz)),random);ok=true;}finally{immediateField.setBoolean(world,previousImmediate);}
      } else ok=gen.b(world,random,bp(ox,oy,oz));
      var rngAfter=random.nextInt(),worldRngAfter=spec.kind==='fluid'?worldRandomField.get(world).nextInt():null,blocks=[];
      if(spec.kind==='fluid')worldRandomField.set(world,previousWorldRandom);
      var radius=spec.kind==='fluid'?16:8;
      for(var y=55;y<((featureMode==="vines"||featureMode==="spikes")?160:80);y++)for(var dz=-radius;dz<=radius;dz++)for(var dx=-radius;dx<=radius;dx++) {
        var isSpringStone=spec.kind==='spring'&&(((dx===0&&dz===0&&(y===oy-1||y===oy+1)))||(y===oy&&((dx===-1&&dz===0)||(dx===0&&dz===-1)||(spec.variant!==1&&dx===0&&dz===1)||(spec.variant===2&&dx===1&&dz===0)||(spec.variant===3&&dx===0&&dz===0))));
        var st=getEncoded(ox+dx,y,oz+dz),base=isSpringStone?16:spec.wall&&dx===1&&y>=64&&y<128?16:y<63?(spec.deposit&&y>=60?48:16):y===63?(spec.patterned&&((ox+dx)&3)===0?144:spec.surface):0;
        if(spec.kind==='fluid')for each(var p in initial)if(p[0]===dx&&p[1]===y-oy&&p[2]===dz)base=p[3];
        if(st!==base)blocks.push([dx,y-oy,dz,st]);
      }
      var entry={kind:spec.kind,variant:spec.variant,patterned:!!spec.patterned,deposit:!!spec.deposit,wall:!!spec.wall,liquid:spec.liquid||null,surface:spec.surface,seed:seed,ox:ox,oy:oy,oz:oz,ok:ok,rngAfter:rngAfter,blocks:blocks};
      if(spec.kind==='fluid') {entry.scenario=spec.scenario;entry.initial=initial;entry.radius=radius;entry.worldSeed=worldSeed;entry.worldRngAfter=worldRngAfter;entry.worldCalls=worldCalls;entry.callerCalls=callerCalls;}
      cases.push(entry);
      if(featureMode==='fluids'&&cases.length%6===0)print('FLUID CASES '+cases.length+' '+spec.scenario);
    }

    var out = new java.util.zip.GZIPOutputStream(new java.io.FileOutputStream(fixtureOutput));
    var pw = new java.io.PrintWriter(new java.io.OutputStreamWriter(out, "UTF-8"));
    pw.print(JSON.stringify(featureMode==='fluids'?{cases:cases,materialMovement:materialMovement}:{cases:cases}));
    pw.close();
    print("WROTE " + fixtureOutput);
  } catch(e) {
    e.printStackTrace();
  }
}));

ServerClass.main(["nogui"]);
