// Native server chunk-provider triggering with a numerical dummy terrain host.
function captureBiomeDecoration(world,setup,getEncoded,rawSet,makeRand) {
 var Generator=Java.type('aoa'),ServerProvider=Java.type('ld'),Chunk=Java.type('amy'),cases=[];
 for each(var sign in [-1,1])for each(var order in [[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]],[[2,2],[1,2],[0,2],[2,1],[1,1],[0,1],[2,0],[1,0],[0,0]],[[0,0],[2,0],[0,2],[2,2],[1,0],[0,1],[2,1],[1,2],[1,1]]]) {
  var events=[],cx=500*sign,cz=500*sign;
  var G=Java.extend(Generator,{
    d:function(x,z){return new Chunk(world,x|0,z|0);},
    a:function(){if(arguments.length===3&&typeof arguments[1]==='number')events.push([Number(arguments[1]),Number(arguments[2])]);}
  });
  var generator=new G(world,7,false,''),provider=new ServerProvider(world,null,generator),steps=[];
  for each(var p in order){provider.c((cx+p[0])|0,(cz+p[1])|0);steps.push({loaded:p,populations:events.slice()});}
  cases.push({x:cx,z:cz,steps:steps});
 }
 return {cases:cases};
}
