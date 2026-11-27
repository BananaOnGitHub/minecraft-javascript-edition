// Behavioral snapshots after each write, and explicit native service calls.
function captureBiomeDecoration(world,setup,getEncoded,rawSet,makeRand) {
  var Pos=Java.type('cj'),Block=Java.type('afh'),Sky=Java.type('ads').a,cases=[];
  for each(var material in [16,288])for each(var sign in [1,-1]) {
    var cx=400*sign,cz=400*sign,x=cx*16+15,z=cz*16+15,y=material===16?66:68;
    setup(cx,cz,63,32);
    var steps=[];
    function snapshot(op) {
      var points=[],allocation=[];
      for(var dx=-3;dx<=3;dx++)for(var dz=-3;dz<=3;dz++)for each(var by in [64,65,66,67,68,69]) {
        var p=new Pos((x+dx)|0,by|0,(z+dz)|0);
        points.push([dx,by,dz,world.b(Sky,p),world.l(p)]);
      }
      for(var dx=0;dx<2;dx++)for(var dz=0;dz<2;dz++)allocation.push([dx,dz,world['a(int,int)'](cx+dx,cz+dz).h()[4]!==null]);
      steps.push({op:op,points:points,allocation:allocation});
    }
    snapshot(['initial']);
    for(var dx=-3;dx<=3;dx++)for(var dz=-3;dz<=3;dz++) {
      world['a(cj,alz,int)'](new Pos((x+dx)|0,y|0,(z+dz)|0),Block.c(material>>4).a(material&15),2);
      snapshot(['set',dx,y,dz,material]);
    }
    for each(var edit in [[0,64,0,640],[0,64,0,624],[0,64,0,496],[0,y,0,material===288?296:16]]) {
      world['a(cj,alz,int)'](new Pos((x+edit[0])|0,edit[1]|0,(z+edit[2])|0),Block.c(edit[3]>>4).a(edit[3]&15),2);
      snapshot(['set',edit[0],edit[1],edit[2],edit[3]]);
    }
    world.c(Sky,new Pos((x-2)|0,64,(z-2)|0));snapshot(['check',-2,64,-2]);
    world['a(int,int)'](cx,cz).b();snapshot(['skymap',0,0]);
    cases.push({material:material,x:x,z:z,steps:steps});
  }
  for each(var sign in [1,-1]) {
    var cx=400*sign,cz=400*sign,x=cx*16+15,z=cz*16+15,steps=[];
    setup(cx,cz,63,32);rawSet(x,60,z,176);world['a(int,int)'](cx,cz).b();
    for(var step=0;step<2;step++) {
      if(step)world.c(Java.type('ads').b,new Pos(x|0,60,z|0));
      var points=[];
      for(var dx=-1;dx<=1;dx++)for(var dz=-1;dz<=1;dz++)for(var y=59;y<=61;y++) {
        var p=new Pos((x+dx)|0,y|0,(z+dz)|0);
        points.push([dx,y,dz,world.b(Sky,p),world.l(p),world.b(Java.type('ads').b,p)]);
      }
      steps.push({op:step?['check-block',0,60,0]:['initial'],points:points,allocation:[]});
    }
    cases.push({material:176,x:x,z:z,initialRaw:[[0,60,0,176]],steps:steps});
  }
  var inputPath=new java.io.File(new java.io.File(auxiliaryProbe).getParentFile(),'fixtures/lighting-canopy-input.json').toPath();
  var input=JSON.parse(new java.lang.String(java.nio.file.Files.readAllBytes(inputPath),'UTF-8'));
  for each(var sign in [1,-1]) {
    var cx=400*sign,cz=400*sign,x=cx*16,z=cz*16,steps=[];
    setup(cx,cz,63,32);setup(cx+1,cz+1,63,32);
    function canopySnapshot(op) {
      var points=[];
      for each(var q in input.points){var p=new Pos((x+q[0])|0,q[1]|0,(z+q[2])|0);points.push([q[0],q[1],q[2],world.b(Sky,p),world.l(p)]);}
      steps.push({op:op,points:points,allocation:[]});
    }
    canopySnapshot(['initial']);
    for each(var e in input.writes) {
      world['a(cj,alz,int)'](new Pos((x+e[0])|0,e[1]|0,(z+e[2])|0),Block.c(e[3]>>4).a(e[3]&15),2);
      canopySnapshot(['set',e[0],e[1],e[2],e[3]]);
    }
    cases.push({material:'canopy-replay',x:x,z:z,steps:steps});
  }
  return {cases:cases};
}
