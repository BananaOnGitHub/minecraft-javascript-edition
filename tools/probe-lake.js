// Black-box numerical observations of isolated lake feature calls.
function captureBiomeDecoration(world,setup,getEncoded,rawSet,makeRand) {
  var Pos=Java.type('cj'),Block=Java.type('afh'),Lake=Java.type('apc'),cases=[];
  for each(var liquid in ['water','lava'])for each(var seed in [1,7,12345])for each(var shape in ['flat','air','wet','hollow','snow','ice','soil','mycelium']) {
    var cx=seed===7?-400:400,cz=shape==='hollow'?-400:400,ox=cx*16+15,oz=cz*16+15,oy=shape==='air'?3:72;
    setup(cx,cz,63,32);setup(cx+1,cz+1,63,32);
    for(var bx=cx-1;bx<=cx+2;bx++)for(var bz=cz-1;bz<=cz+2;bz++)java.util.Arrays.fill(world['a(int,int)'](bx|0,bz|0).k(),(shape==='snow'||shape==='ice'?12:shape==='mycelium'?14:1)|0);
    var initial=[];if(shape==='soil'||shape==='mycelium')for(var dx=-8;dx<=7;dx++)for(var dz=-8;dz<=7;dz++)for(var y=60;y<=63;y++)initial.push([dx,y,dz,48]);
    if(shape==='ice')initial.push([-8,63,-8,144]);
    if(shape==='wet')for(var dx=-8;dx<=7;dx++)for(var dz=-8;dz<=7;dz++)initial.push([dx,64,dz,144]);
    if(shape==='hollow')for(var dx=-8;dx<=7;dx++)for(var dz=-8;dz<=7;dz++)initial.push([dx,58,dz,0]);
    for each(var e in initial)rawSet(ox+e[0],e[1],oz+e[2],e[3]);
    var before={};for(var x=-9;x<=8;x++)for(var z=-9;z<=8;z++)for(var y=48;y<=75;y++)before[x+','+y+','+z]=getEncoded(ox+x,y,oz+z);
    var calls=[],random=makeRand(seed,calls),gen=new Lake(Block.b(liquid)),ok=gen.b(world,random,new Pos(ox|0,oy|0,oz|0)),after=random.nextInt(),changes=[];
    for(var x=-9;x<=8;x++)for(var z=-9;z<=8;z++)for(var y=48;y<=75;y++){var state=getEncoded(ox+x,y,oz+z);if(state!==before[x+','+y+','+z])changes.push([x,y,z,state]);}
    cases.push({liquid:liquid,seed:seed,shape:shape,x:ox,y:oy,z:oz,initial:initial,ok:ok,rngAfter:after,calls:calls,blocks:changes});
  }
  return {cases:cases};
}
