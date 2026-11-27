// Black-box numerical reference probe, using the supplied local 1.8.9 server.
// Runtime ABI names only; no game source or assets. Derived from the handoff probe.
var fixtureOutput = String(arguments[0]);
var featureMode = String(arguments[1] || "double");
// Probe: re-capture big_oak for seeds 1, 2, 7 with correct world coords
// This reproduces the exact fixture conditions

var Thread = java.lang.Thread;
var Runtime = java.lang.Runtime;
var Random = java.util.Random;
var BlockPos = Java.type("cj");
var ServerClass = Java.type("net.minecraft.server.MinecraftServer");

function bp(x, y, z) { return new BlockPos(x | 0, y | 0, z | 0); }

function makeRand(seed) {
  var inner = new Random(seed);
  var ready = false;
  var R = Java.extend(Random, {
    setSeed: function(s) { if (ready) inner.setSeed(s); },
    nextInt: function(bound) {
      if (bound === undefined) return inner.nextInt();
      return inner.nextInt(bound);
    },
    nextFloat: function() { return inner.nextFloat(); },
    nextLong: function() { return inner.nextLong(); },
    nextDouble: function() { return inner.nextDouble(); },
    nextBoolean: function() { return inner.nextBoolean(); }
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

    function setupGrass(cx0, cz0, surfaceY, surfaceCode) {
      for (var cx = cx0 - 2; cx <= cx0 + 2; cx++)
        for (var cz = cz0 - 2; cz <= cz0 + 2; cz++)
          world["a(int,int)"](cx | 0, cz | 0);
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

    var cases=[];
    var specs=[]; for(var variant=0;variant<6;variant++) specs.push({kind:"double",surface:32,variant:variant});
    specs.push({kind:"double",surface:16,variant:2});
    specs.push({kind:"double",surface:48,variant:2});
    specs.push({kind:"double",surface:960,variant:2});
    if(featureMode==="patches") {
      specs=[];var fields=['s','t','u','x'];
      for(var j=0;j<fields.length;j++)for(var k=0;k<2;k++)
        specs.push({kind:'decorator-'+fields[j],surface:k===0?32:192,variant:2});
    }
    var decorator=Java.type('ady')['e(int)'](1).as;
    for(var si=0;si<specs.length;si++) for(var ji=0;ji<3;ji++) for(var hi=0;hi<2;hi++) {
      var spec=specs[si],seed=[1,7,12345][ji],cx=400+si*12+ji*3,cz=400+hi*4;
      setupGrass(cx,cz,63,spec.surface);
      var ox=cx*16+15,oy=hi===0?64:72,oz=cz*16+15;
      var gen;
      if(spec.kind==='double') {gen=new DoublePlant();gen.a(Kind.values()[spec.variant]);}
      else {var field=decorator.getClass().getDeclaredField(spec.kind.slice(10));field.setAccessible(true);gen=field.get(decorator);}
      var random=makeRand(seed),ok=gen.b(world,random,bp(ox,oy,oz)),rngAfter=random.nextInt(),blocks=[];
      for(var y=55;y<80;y++)for(var dz=-8;dz<=8;dz++)for(var dx=-8;dx<=8;dx++) {
        var st=getEncoded(ox+dx,y,oz+dz),base=y<63?16:y===63?spec.surface:0;
        if(st!==base)blocks.push([dx,y-oy,dz,st]);
      }
      cases.push({kind:spec.kind,variant:spec.variant,surface:spec.surface,seed:seed,ox:ox,oy:oy,oz:oz,ok:ok,rngAfter:rngAfter,blocks:blocks});
    }

    var out = new java.util.zip.GZIPOutputStream(new java.io.FileOutputStream(fixtureOutput));
    var pw = new java.io.PrintWriter(new java.io.OutputStreamWriter(out, "UTF-8"));
    pw.print(JSON.stringify({ cases: cases }));
    pw.close();
    print("WROTE " + fixtureOutput);
  } catch(e) {
    e.printStackTrace();
  }
}));

ServerClass.main(["nogui"]);
