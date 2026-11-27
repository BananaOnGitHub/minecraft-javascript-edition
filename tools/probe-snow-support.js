function captureBiomeDecoration(world,setup,getEncoded,rawSet,makeRand) {
 var Pos=Java.type('cj'),Block=Java.type('afh'),cases=[];
 for each(var sign in [-1,1])for each(var y in [64,100]) {
  var cx=400*sign,cz=400*sign,x=cx*16+15,z=cz*16+15;setup(cx,cz,63,32);setup(cx+1,cz+1,63,32);
  for(var bx=cx-1;bx<=cx+2;bx++)for(var bz=cz-1;bz<=cz+2;bz++)java.util.Arrays.fill(world['a(int,int)'](bx|0,bz|0).k(),12);
  var p=new Pos(x|0,y|0,z|0),observations=[];
  for each(var support in [0,16,32,48,288,320,1264,1280,1248,1255,352,688,960,592,144,176]) {
   rawSet(x,y-1,z,support);rawSet(x,y,z,0);
   observations.push({support:support,canSnow:world['f(cj,boolean)'](p,true)});
  }
  cases.push({x:x,y:y,z:z,observations:observations});
 }
 return {cases:cases};
}
