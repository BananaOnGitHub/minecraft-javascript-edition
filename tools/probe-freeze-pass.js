// Isolated native world-service sequence for the final freeze/snow stage.
function captureBiomeDecoration(world,setup,getEncoded,rawSet,makeRand) {
 var Pos=Java.type('cj'),Block=Java.type('afh'),Biome=Java.type('ady'),cases=[];
 for each(var biome in [1,3,10,12,30,140])for each(var sign in [-1,1]) {
  var cx=400*sign,cz=400*sign,ox=cx*16,oz=cz*16;setup(cx,cz,63,32);setup(cx+1,cz+1,63,32);
  for(var bx=cx-1;bx<=cx+2;bx++)for(var bz=cz-1;bz<=cz+2;bz++)java.util.Arrays.fill(world['a(int,int)'](bx|0,bz|0).k(),biome|0);
  var initial=[];
  for(var x=8;x<24;x++)for(var z=8;z<24;z++) {
   var type=(x*7+z*11)%6;
   if(type===0)initial.push([x,63,z,144]);
   else if(type===1)initial.push([x,63,z,145]);
   else if(type===2)initial.push([x,64,z,592]);
   else if(type===3)initial.push([x,64,z,288]);
   else if(type===4)initial.push([x,64,z,320]);
  }
  for each(var e in initial)rawSet(ox+e[0],e[1],oz+e[2],e[3]);
  var heightField=Java.type('amy').class.getDeclaredField('f');heightField.setAccessible(true);
  for(var bx=cx-1;bx<=cx+2;bx++)for(var bz=cz-1;bz<=cz+2;bz++)java.util.Arrays.fill(heightField.get(world['a(int,int)'](bx|0,bz|0)),-999);
  var before={};for(var x=8;x<24;x++)for(var z=8;z<24;z++)for(var y=62;y<68;y++)before[x+','+y+','+z]=getEncoded(ox+x,y,oz+z);
  for(var x=8;x<24;x++)for(var z=8;z<24;z++){
   var p=world.q(new Pos((ox+x)|0,0,(oz+z)|0)),y=p.o(),below=new Pos((ox+x)|0,(y-1)|0,(oz+z)|0);
   if(world['e(cj,boolean)'](below,false))world['a(cj,alz,int)'](below,Block.c(79).Q(),2);
   if(world['f(cj,boolean)'](p,true))world['a(cj,alz,int)'](p,Block.c(78).Q(),2);
  }
  var changes=[];for(var x=8;x<24;x++)for(var z=8;z<24;z++)for(var y=62;y<68;y++){var state=getEncoded(ox+x,y,oz+z);if(state!==before[x+','+y+','+z])changes.push([x,y,z,state]);}
  cases.push({biome:biome,baseTemp:Biome['e(int)'](biome).ap,x:ox,z:oz,initial:initial,blocks:changes});
 }
 return {cases:cases};
}
