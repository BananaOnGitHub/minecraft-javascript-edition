// Numeric calls to the native limb method; no source inspection or patching.
function captureBiomeDecoration(world,setup,getEncoded,rawSet,makeRand) {
 var Tree=Java.type('aoi'),Pos=Java.type('cj'),Block=Java.type('afh'),cases=[];
 var limb=Tree.class.getDeclaredMethod('a',Pos.class,Pos.class,Block.class);limb.setAccessible(true);
 var field=Tree.class.getDeclaredField('l');field.setAccessible(true);
 for each(var sign in [-1,1])for each(var delta in [[0,0,0],[0,2,0],[2,0,0]]){
  var cx=400*sign,cz=400*sign,x=cx*16+15,z=cz*16+15,y=70;setup(cx,cz,63,32);
  var gen=new Tree(false);field.set(gen,world);
  limb.invoke(gen,new Pos(x|0,y|0,z|0),new Pos((x+delta[0])|0,(y+delta[1])|0,(z+delta[2])|0),Block.c(17));
  var blocks=[];for(var dx=-1;dx<=3;dx++)for(var dy=-1;dy<=3;dy++)for(var dz=-1;dz<=1;dz++){var s=getEncoded(x+dx,y+dy,z+dz);if(s!==0)blocks.push([dx,dy,dz,s]);}
  cases.push({x:x,y:y,z:z,delta:delta,blocks:blocks});
 }
 return {cases:cases};
}
