// Native query observations; synthetic terrain and biome IDs only.
function captureBiomeDecoration(world,setup,getEncoded,rawSet,makeRand) {
 var Pos=Java.type('cj'),Biome=Java.type('ady'),cases=[];
 for each(var id in [0,1,3,6,10,12,30,140])for each(var sign in [-1,1])for each(var y in [64,100,140]) {
  var cx=sign*400,cz=sign*400,x=cx*16+15,z=cz*16+15;setup(cx,cz,63,32);setup(cx+1,cz+1,63,32);
  for(var bx=cx-1;bx<=cx+2;bx++)for(var bz=cz-1;bz<=cz+2;bz++)java.util.Arrays.fill(world['a(int,int)'](bx|0,bz|0).k(),id|0);
  var p=new Pos(x|0,y|0,z|0),biome=Biome['e(int)'](id),observations=[];
  for each(var state in [0,128,129,144,145,16,32,48,288,320,1264,1280,2000,592]) {
    rawSet(x,y,z,state);
    var out=world.q(p);
    observations.push({state:state,height:out.o(),freeze:world['e(cj,boolean)'](p,false),freezeEdge:world['e(cj,boolean)'](p,true),snow:world['f(cj,boolean)'](p,false),snowLight:world['f(cj,boolean)'](p,true),sky:world.b(Java.type('ads').a,p),block:world.b(Java.type('ads').b,p)});
  }
  cases.push({biome:id,x:x,y:y,z:z,baseTemp:biome.ap,temperature:biome['a(cj)'](p),observations:observations});
 }
 return {cases:cases};
}
