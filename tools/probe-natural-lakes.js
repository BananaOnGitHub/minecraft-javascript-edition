// Native unpopulated terrain inputs and isolated lake invocations.
function captureBiomeDecoration(world,setup,getEncoded,rawSet,makeRand) {
 var Pos=Java.type('cj'),Block=Java.type('afh'),Lake=Java.type('apc'),Provider=Java.type('aoa'),cases=[];
 var provider=new Provider(world,7,true,'');
 for each(var spec in [[14,-22],[-205,83],[-97,-2],[3,-169]])for each(var liquid in ['water','lava']) {
  var cx=spec[0],cz=spec[1],ox=cx*16+15,oz=cz*16+15,oy=80,sections=[];
  for(var dx=-2;dx<=3;dx++)for(var dz=-2;dz<=3;dz++)world['a(int,int)']((cx+dx)|0,(cz+dz)|0);
  var populated=Java.type('amy').class.getDeclaredField('n');populated.setAccessible(true);
  for(var dx=-2;dx<=3;dx++)for(var dz=-2;dz<=3;dz++)populated.setBoolean(world['a(int,int)']((cx+dx)|0,(cz+dz)|0),true);
  for(var dz=-1;dz<=2;dz++)for(var dx=-1;dx<=2;dx++) {
   var target=world['a(int,int)']((cx+dx)|0,(cz+dz)|0),source=provider.d((cx+dx)|0,(cz+dz)|0),src=source.h(),dst=target.h();
   for(var sy=0;sy<16;sy++)dst[sy]=src[sy];
   java.lang.System.arraycopy(source.k(),0,target.k(),0,256);target.b();
   for(var sy=0;sy<16;sy++)if(src[sy]!==null){var runs=[],last=-1,count=0,a=src[sy].g();for(var i=0;i<4096;i++){var value=String(a[i]).charCodeAt(0);if(value===last)count++;else{if(count)runs.push(last,count);last=value;count=1;}}if(count)runs.push(last,count);sections.push({section:((dz+1)*4+dx+1)*16+sy,runs:runs});}
  }
  var before={};for(var x=-9;x<=8;x++)for(var z=-9;z<=8;z++)for(var y=0;y<100;y++)before[x+','+y+','+z]=getEncoded(ox+x,y,oz+z);
  var calls=[],r=makeRand(7,calls),ok=new Lake(Block.b(liquid)).b(world,r,new Pos(ox|0,oy|0,oz|0)),rngAfter=r.nextInt(),changes=[];
  for(var x=-9;x<=8;x++)for(var z=-9;z<=8;z++)for(var y=0;y<100;y++){var s=getEncoded(ox+x,y,oz+z);if(s!==before[x+','+y+','+z])changes.push([x,y,z,s]);}
  cases.push({x:ox,y:oy,z:oz,seed:7,liquid:liquid,ok:ok,rngAfter:rngAfter,calls:calls,blocks:changes,input:sections});
 }
 return {cases:cases};
}
