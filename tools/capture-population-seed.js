// Numerical fixture using Java 8 Random and BigInteger long-wrap arithmetic.
// Run with jjs tools/capture-population-seed.js > tools/fixtures/population-seed-189.json
var Big=Java.type('java.math.BigInteger'), Long=Java.type('java.lang.Long'), Random=Java.type('java.util.Random');
var seeds=['0','1','-1','7','-7','-9223372036854775808','9223372036854775807','4294967303'];
var coordinates=[[0,0],[1,1],[-1,-1],[17,-31],[-17,31],[-2147483648,2147483647],[2147483647,-2147483648]];
var cases=[];
for each(var seed in seeds)for each(var c in coordinates){
  var random=new Random(Long.parseLong(seed));
  var mx=Big.valueOf(random.nextLong()).divide(Big.valueOf(2)).multiply(Big.valueOf(2)).add(Big.ONE);
  var mz=Big.valueOf(random.nextLong()).divide(Big.valueOf(2)).multiply(Big.valueOf(2)).add(Big.ONE);
  var mixed=mx.multiply(Big.valueOf(c[0])).add(mz.multiply(Big.valueOf(c[1]))).xor(new Big(seed)).longValue();
  random.setSeed(mixed);
  cases.push({worldSeed:seed,chunkX:c[0],chunkZ:c[1],populationSeed:Long.toString(mixed),nextInt:random.nextInt(),nextLong:Long.toString(random.nextLong())});
}
print(JSON.stringify({source:'Java 8 Random and BigInteger signed-long wrap arithmetic',cases:cases}));
