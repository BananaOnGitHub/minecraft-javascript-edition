function captureBiomeDecoration(world,setup,getEncoded,rawSet,makeRand){
 var Provider=Java.type('aoa'),Random=Java.type('java.util.Random'),Long=Java.type('java.lang.Long'),cases=[];
 for each(var coords in [[0,0],[1,1],[-1,-1],[17,-31],[-17,31]]){
   var events=[],inner=new Random(0),ready=false;
   var R=Java.extend(Random,{
     setSeed:function(s){if(ready){events.push(Long.toString(s));inner.setSeed(s);if(events.length===2)throw new java.lang.RuntimeException('CAPTURED');}},
     nextLong:function(){return inner.nextLong();}
   });
   var r=new R();ready=true;
   var provider=new Provider(world,7,false,'');
   var f=Provider.class.getDeclaredField('h');f.setAccessible(true);f.set(provider,r);
   try{provider['a(amv,int,int)'](null,coords[0]|0,coords[1]|0);}catch(e){if(events.length!==2)throw e;}
   cases.push({x:coords[0],z:coords[1],seed0:events[0],seed1:events[1]});
 }
 return {cases:cases};
}
