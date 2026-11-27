// Numerical native services, loaded by the existing disposable-world runner.
function captureBiomeDecoration(world,setup,getEncoded,rawSet,makeRand) {
  var Block=Java.type('afh'),Pos=Java.type('cj'),palette=[],cases=[];
  var neighbor=Block.class.getDeclaredField('v');neighbor.setAccessible(true);
  for(var id=0;id<198;id++) {var b=Block.c(id);palette.push([id,b.p(),b.r(),b.c(),b.d(),b.t().c(),neighbor.getBoolean(b),b.o()]);}
  var scenarios=[{name:'open',initial:[],edits:[[0,64,0,16],[0,64,0,0]]},
    {name:'glass',initial:[],edits:[[0,67,0,320],[0,67,0,0]]},
    {name:'leaves',initial:[],edits:[[0,67,0,288],[1,67,0,288],[0,67,0,0]]},
    {name:'water',initial:[],edits:[[0,67,0,144],[0,66,0,144],[0,67,0,0]]},
    {name:'torch',initial:[],edits:[[0,64,0,805],[0,64,0,0]]},
    {name:'glowstone',initial:[],edits:[[0,65,0,1424],[0,65,0,0]]},
    {name:'mushroom-canopy',initial:[],edits:[[0,64,0,624],[1,64,0,640]]},
    {name:'cave',initial:[],edits:[[0,64,0,805],[0,64,0,0]]},
    {name:'mix',initial:[],edits:[[0,64,0,144],[1,64,0,176]]},
    {name:'support',initial:[],edits:[[0,63,0,16],[0,63,0,48],[0,63,0,0]]}];
  for each(var sc in scenarios)if(sc.name==='cave'||sc.name==='mushroom-canopy')for(var dx=-3;dx<=3;dx++)for(var dz=-3;dz<=3;dz++)sc.initial.push([dx,sc.name==='cave'?66:68,dz,sc.name==='cave'?16:288]);
  for each(var scenario in scenarios)for each(var sign in [1,-1]) {
    var cx=sign*400,cz=sign*400,x=cx*16+15,z=cz*16+15;
    setup(cx,cz,63,32);
    for each(var input in scenario.initial)world['a(cj,alz,int)'](new Pos((x+input[0])|0,input[1]|0,(z+input[2])|0),Block.c(input[3]>>4).a(input[3]&15),2);
    var snapshots=[];
    function observe() {
      var points=[],heights=[],predicates=[];
      for(var dx=-2;dx<=2;dx++)for(var dz=-2;dz<=2;dz++) {
        var p=new Pos((x+dx)|0,0,(z+dz)|0);
        heights.push([dx,dz,world.m(p).o(),world.r(p).o()]);
        for(var y=63;y<=70;y++) {
          p=new Pos((x+dx)|0,y|0,(z+dz)|0);
          points.push([dx,y,dz,world.b(Java.type('ads').a,p),world.b(Java.type('ads').b,p),world.l(p)]);
        }
      }
      for(var dx=-1;dx<=1;dx++)for(var dz=-1;dz<=1;dz++)for each(var id in [31,32,37,38,39,40]) {
        var p=new Pos((x+dx)|0,64,(z+dz)|0),block=Block.c(id);
        predicates.push([dx,64,dz,id<<4,block.f(world,p,block.Q())]);
      }
      snapshots.push({points:points,heights:heights,predicates:predicates});
    }
    observe();
    for each(var edit in scenario.edits) {
      var p=new Pos((x+edit[0])|0,edit[1]|0,(z+edit[2])|0),state=Block.c(edit[3]>>4).a(edit[3]&15);
      world['a(cj,alz,int)'](p,state,2);observe();
    }
    cases.push({name:scenario.name,x:x,z:z,initial:scenario.initial,initialMode:'ordered-writes',edits:scenario.edits,snapshots:snapshots});
  }
  return {palette:palette,cases:cases};
}
