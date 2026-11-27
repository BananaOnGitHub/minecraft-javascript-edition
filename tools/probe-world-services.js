// Numerical native services, loaded by the existing disposable-world runner.
function captureBiomeDecoration(world,setup,getEncoded,rawSet,makeRand) {
  var Block=Java.type('afh'),Pos=Java.type('cj'),palette=[],cases=[];
  var neighbor=Block.class.getDeclaredField('v');neighbor.setAccessible(true);
  for(var id=0;id<198;id++) {var b=Block.c(id);palette.push([id,b.p(),b.r(),b.c(),b.d(),b.t().c(),neighbor.getBoolean(b)]);}
  var scenarios=[{name:'open',initial:[],edits:[[0,64,0,16],[0,64,0,0]]},
    {name:'glass',initial:[],edits:[[0,67,0,320],[0,67,0,0]]},
    {name:'leaves',initial:[],edits:[[0,67,0,288],[1,67,0,288],[0,67,0,0]]},
    {name:'water',initial:[],edits:[[0,67,0,144],[0,66,0,144],[0,67,0,0]]},
    {name:'torch',initial:[],edits:[[0,64,0,805],[0,64,0,0]]},
    {name:'glowstone',initial:[],edits:[[0,65,0,1424],[0,65,0,0]]}];
  for each(var scenario in scenarios)for each(var sign in [1,-1]) {
    var cx=sign*400,cz=sign*400,x=cx*16+15,z=cz*16+15;
    setup(cx,cz,63,32);
    var snapshots=[];
    function observe() {
      var points=[],heights=[];
      for(var dx=-2;dx<=2;dx++)for(var dz=-2;dz<=2;dz++) {
        var p=new Pos((x+dx)|0,0,(z+dz)|0);
        heights.push([dx,dz,world.m(p).o(),world.r(p).o()]);
        for(var y=63;y<=70;y++) {
          p=new Pos((x+dx)|0,y|0,(z+dz)|0);
          points.push([dx,y,dz,world.b(Java.type('ads').a,p),world.b(Java.type('ads').b,p),world.l(p)]);
        }
      }
      snapshots.push({points:points,heights:heights});
    }
    observe();
    for each(var edit in scenario.edits) {
      var p=new Pos((x+edit[0])|0,edit[1]|0,(z+edit[2])|0),state=Block.c(edit[3]>>4).a(edit[3]&15);
      world['a(cj,alz,int)'](p,state,2);observe();
    }
    cases.push({name:scenario.name,x:x,z:z,initial:scenario.initial,edits:scenario.edits,snapshots:snapshots});
  }
  return {palette:palette,cases:cases};
}
