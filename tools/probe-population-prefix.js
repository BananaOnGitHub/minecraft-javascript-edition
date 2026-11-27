// Actual provider calls, stopping before the first unsupported dungeon draw.
function captureBiomeDecoration(world,setup,getEncoded,rawSet,makeRand) {
 var Provider=Java.type('aoa'),Random=Java.type('java.util.Random'),Long=Java.type('java.lang.Long'),cases=[];
 for each(var delta in [0,1])for each(var sign in [-1,1]) {
  var seed=7,cx=400*sign+delta,cz=400*sign;setup(cx,cz,63,32);setup(cx+1,cz+1,63,32);
  for(var x=cx-1;x<=cx+2;x++)for(var z=cz-1;z<=cz+2;z++)java.util.Arrays.fill(world['a(int,int)'](x|0,z|0).k(),1);
  var events=[],inner=new Random(seed),ready=false,stopped=false;
  function log(method,bound){
   var stack=new java.lang.Throwable().getStackTrace(),caller='';
   for each(var frame in stack){var c=String(frame.getClassName());if(c==='aoa'||c==='apc'||c==='api'){caller=c;break;}}
   events.push([method,bound===undefined?null:bound,caller]);
   if(caller==='api'||events.length>4096){stopped=true;throw new java.lang.RuntimeException('CAPTURE_LIMIT');}
  }
  var R=Java.extend(Random,{
   setSeed:function(s){if(ready){events.push(['setSeed',Long.toString(s)]);inner.setSeed(s);}},
   nextLong:function(){log('nextLong');return inner.nextLong();},
   nextInt:function(b){log('nextInt',b===undefined?null:Number(b));return b===undefined?inner.nextInt():inner.nextInt(b);},
   nextDouble:function(){log('nextDouble');return inner.nextDouble();},
   nextFloat:function(){log('nextFloat');return inner.nextFloat();}
  });
  var r=new R();ready=true,provider=new Provider(world,7,false,'');
  var field=Provider.class.getDeclaredField('h');field.setAccessible(true);field.set(provider,r);
  var error=null;try{provider['a(amv,int,int)'](null,cx|0,cz|0);}catch(e){error=String(e);}
  cases.push({worldSeed:7,initialRandomSeed:seed,x:cx,z:cz,events:events,stopped:stopped,error:error});
 }
 return {cases:cases};
}
