// Black-box numerical reference probe, using the supplied local 1.8.9 server.
// Runtime ABI names only; no game source or assets. Derived from the handoff probe.
var fixtureOutput = String(arguments[0]);
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
    var BigTreeGen = Java.type("aoi"); // WorldGenBigTree

    function getEncoded(x, y, z) {
      var ch = world["a(int,int)"]((x >> 4) | 0, (z >> 4) | 0);
      var sec = ch.h()[(y >> 4) | 0];
      if (!sec) return 0;
      return String(sec.g()[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)]).charCodeAt(0);
    }

    function setupGrass(cx0, cz0, surfaceY) {
      for (var cx = cx0 - 2; cx <= cx0 + 2; cx++)
        for (var cz = cz0 - 2; cz <= cz0 + 2; cz++)
          world["a(int,int)"](cx | 0, cz | 0);
      var stoneChar = java.lang.Character.valueOf('\u0010');
      var grassChar = java.lang.Character.valueOf('\u0020');
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

    var gen = new BigTreeGen(false);
    var seeds = [1, 2, 7];
    var cases = [];

    for (var mode=0; mode<2; mode++) for (var ji = 0; ji < seeds.length; ji++) {
      var seed = seeds[ji];
      // Use distinct chunk positions far apart
      var cx = 500 + ji * 4;
      var cz = 500;
      setupGrass(cx, cz, 63);
      var ox = cx * 16 + 8, oy = 64, oz = cz * 16 + 8;
      if(mode===1) gen=new BigTreeGen(false);
      var random = makeRand(seed);
      var ok = gen.b(world, random, bp(ox, oy, oz));
      var rngAfter = random.nextInt();
      var heightField=gen.getClass().getDeclaredField("a");
      heightField.setAccessible(true);
      var retainedHeight=heightField.getInt(gen);
      var blocks = [];
      for (var dy = 58; dy < 110; dy++) {
        for (var dz = -16; dz < 16; dz++) {
          for (var dx = -16; dx < 16; dx++) {
            var st = getEncoded(ox + dx, dy, oz + dz);
            var exp = dy < 63 ? 16 : (dy === 63 ? 32 : 0);
            if (st !== exp) blocks.push([dx, dy - oy, dz, st]);
          }
        }
      }
      cases.push({ kind: "big_oak", lifecycle: mode===0?"shared":"fresh", heightLimit: retainedHeight, rngAfter: rngAfter, seed: seed, ox: ox, oy: oy, oz: oz, ok: ok, blocks: blocks });
      print("big_oak seed=" + seed + " ok=" + ok + " blocks=" + blocks.length);
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
