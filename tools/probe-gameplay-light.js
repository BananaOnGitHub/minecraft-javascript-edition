// Numerical observations only: generated terrain, cached light, native chunk
// maintenance and explicit light checks. No proprietary implementation source.
function captureBiomeDecoration(world,setup,getEncoded,rawSet,makeRand) {
 var Pos=Java.type('cj'),Sky=Java.type('ads'),Provider=Java.type('aoa'),cases=[];
 var populated=Java.type('amy').class.getDeclaredField('n');populated.setAccessible(true);
 var gap=Java.type('amy').class.getDeclaredField('k');gap.setAccessible(true);
 var specs=[{name:'reported-overhang',seed:'-321252946616194827',cx:7,cz:0,natural:true},
 {name:'reported-east-overhang',seed:'-321252946616194827',cx:8,cz:0,natural:true},
 {name:'reported-west-overhang',seed:'-321252946616194827',cx:6,cz:0,natural:true},
 {name:'reported-west-south-overhang',seed:'-321252946616194827',cx:6,cz:1,natural:true},
 {name:'roof-positive',cx:400,cz:400},{name:'roof-negative',cx:-400,cz:-400},
 {name:'transparent',cx:410,cz:410}];
 for each(var spec in specs){
  var cx=spec.cx,cz=spec.cz,cols=[],chunks=[],provider=spec.natural?new Provider(world,java.lang.Long.parseLong(spec.seed),true,''):null;
  for(var dz=-2;dz<=2;dz++)for(var dx=-2;dx<=2;dx++){var c=world['a(int,int)']((cx+dx)|0,(cz+dz)|0);populated.setBoolean(c,true);}
  if(!spec.natural)setup(cx,cz,63,32);
  for(var dz=-1;dz<=1;dz++)for(var dx=-1;dx<=1;dx++){
   var target=world['a(int,int)']((cx+dx)|0,(cz+dz)|0),dst=target.h();
   if(provider){var src=provider.d((cx+dx)|0,(cz+dz)|0);for(var sy=0;sy<16;sy++)dst[sy]=src.h()[sy];java.lang.System.arraycopy(src.k(),0,target.k(),0,256);}
   else{
    // broad roof straddling chunk boundaries, dark chamber connected to daylight.
    for(var sy=4;sy<=5;sy++){if(!dst[sy])dst[sy]=new (Java.type('amz'))(sy*16,true);}
    for(var lx=0;lx<16;lx++)for(var lz=0;lz<16;lz++){
     var x=dx*16+lx,z=dz*16+lz;
     if(x>=-6&&x<=23&&z>=-6&&z<=23){var st=spec.name==='transparent'?288:16;dst[4].g()[((75&15)<<8)|(lz<<4)|lx]=java.lang.Character.valueOf(String.fromCharCode(st));}
     if(spec.name==='transparent'&&x>=2&&x<=9&&z>=2&&z<=9)dst[4].g()[((72&15)<<8)|(lz<<4)|lx]=java.lang.Character.valueOf(String.fromCharCode(144));
     if(x===7&&z===7)dst[4].g()[((65&15)<<8)|(lz<<4)|lx]=java.lang.Character.valueOf(String.fromCharCode(1424));
    }
    for(var sy=0;sy<16;sy++)if(dst[sy])dst[sy].e();
   }
   target.b();populated.setBoolean(target,true);chunks.push(target);
   var sections=[];
   for(var sy=0;sy<16;sy++)if(dst[sy]){var a=dst[sy].g(),runs=[],last=-1,n=0;for(var i=0;i<4096;i++){var s=String(a[i]).charCodeAt(0);if(s===last)n++;else{if(n)runs.push(last,n);last=s;n=1;}}if(n)runs.push(last,n);sections.push({sy:sy,runs:runs});}
   cols.push({x:cx+dx,z:cz+dz,sections:sections});
  }
  function observe(){var points=[];for(var z=0;z<16;z++)for(var x=0;x<16;x++)for(var y=60;y<=90;y++){
   var p=new Pos((cx*16+x)|0,y|0,(cz*16+z)|0);points.push([x,y,z,getEncoded(cx*16+x,y,cz*16+z),world.b(Sky.a,p),world.b(Sky.b,p)]);
  }return points;}
  var initial=observe();
  for each(var c in chunks){gap.setBoolean(c,true);c.n();}
  for(var tick=0;tick<3;tick++)for each(var c in chunks)c['b(boolean)'](false);
  var maintained=observe();
  // Isolate settled cached-light behavior from chunk lifecycle timing: check a
  // complete interior with a full light-radius margin, in both channels.
  function settle(){for(var pass=0;pass<2;pass++)for(var z=-15;z<31;z++)for(var x=-15;x<31;x++)for(var y=48;y<=105;y++){
   var p=new Pos((cx*16+x)|0,y|0,(cz*16+z)|0);world.c(Sky.a,p);world.c(Sky.b,p);
  }
  }
  settle();var settled=observe(),edits=[],edited=null;
  if(!spec.natural){edits=[[7,75,7,0],[15,64,7,805],[7,65,7,0],[8,74,8,320],[9,74,8,176]];
    for each(var e in edits)world['a(cj,alz,int)'](new Pos((cx*16+e[0])|0,e[1]|0,(cz*16+e[2])|0),Java.type('afh').c(e[3]>>4).a(e[3]&15),2);
    settle();edited=observe();
  }
  var editChanges=[];
  if(edited)for each(var col in cols){
    var secs=world['a(int,int)'](col.x|0,col.z|0).h();
    for(var sy=0;sy<16;sy++){
      var input=null;for each(var section in col.sections)if(section.sy===sy)input=section.runs;
      var run=0,left=input?input[1]:4096,old=input?input[0]:0;
      for(var i=0;i<4096;i++){
        var state=secs[sy]?String(secs[sy].g()[i]).charCodeAt(0):0;
        if(state!==old)editChanges.push([col.x*16+(i&15),sy*16+(i>>8),col.z*16+((i>>4)&15),state]);
        if(--left===0&&input&&run+2<input.length){run+=2;old=input[run];left=input[run+1];}
      }
    }
  }
  cases.push({name:spec.name,seed:spec.seed||null,x:cx,z:cz,columns:cols,initial:initial,maintained:maintained,settled:settled,edits:edits,editChanges:editChanges,edited:edited});
 }
 return {cases:cases};
}
