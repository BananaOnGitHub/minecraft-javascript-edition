function captureBiomeDecoration(world,setup,getEncoded,rawSet,makeRand) {
 var Pos=Java.type('cj'),Block=Java.type('afh'),cases=[];
 for each(var sign in [-1,1])for each(var scenario in ['open','enclosed','lit','lit-water']) {
  var cx=400*sign,cz=400*sign,x=cx*16+15,z=cz*16+15,y=64;setup(cx,cz,63,32);setup(cx+1,cz+1,63,32);
  for(var bx=cx-1;bx<=cx+2;bx++)for(var bz=cz-1;bz<=cz+2;bz++)java.util.Arrays.fill(world['a(int,int)'](bx|0,bz|0).k(),12);
  var initial=[],p=new Pos(x|0,y|0,z|0);
  if(scenario==='enclosed'){initial.push([0,0,0,144],[-1,0,0,144],[1,0,0,144],[0,0,-1,144],[0,0,1,144]);}
  if(scenario==='lit-water')initial.push([0,0,0,144]);
  for each(var e in initial)rawSet(x+e[0],y+e[1],z+e[2],e[3]);
  if(scenario==='lit'||scenario==='lit-water')world['a(cj,alz,int)'](new Pos((x+1)|0,y|0,z|0),Block.c(50).Q(),2);
  cases.push({x:x,y:y,z:z,scenario:scenario,initial:initial,block:world.b(Java.type('ads').b,p),freeze:world['e(cj,boolean)'](p,false),edge:world['e(cj,boolean)'](p,true),methodV:world.v(p),methodW:world.w(p),snow:world['f(cj,boolean)'](p,true)});
 }
 return {cases:cases};
}
