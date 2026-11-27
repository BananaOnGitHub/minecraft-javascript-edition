// Black-box native biome calls. Loaded by the existing decoration probe/runner.
// No game source, instrumentation patches, or assets are used.
function captureBiomeDecoration(world,setup,getEncoded,rawSet,makeRand) {
  var Biome=Java.type('ady'),cases=[],configs=[],Arrays=java.util.Arrays,traceTypes=[],traceIds={};
  var registryField=Biome.class.getDeclaredField('aE');registryField.setAccessible(true);
  var registry=registryField.get(null),decoratorField=Biome.class.getField('as');
  var decorate=Biome.class.getMethod('a',Java.type('adm').class,java.util.Random.class,Java.type('cj').class);
  var treeEvents=[],mushroomEvents=[],activeCalls=null,wrapped=new java.util.IdentityHashMap();
  function wrapMushrooms(decorator) {
    for each(var name in ['t','u']) {
      var field=Java.type('aeb').class.getDeclaredField(name);field.setAccessible(true);
      var original=field.get(decorator);if(wrapped.containsKey(original))continue;
      function proxyFor(original,name) {
        var R=Java.extend(Java.type('aot'),{b:function(w,r,p){
          var x=coord(p,'x'),y=coord(p,'y'),z=coord(p,'z'),light=[];
          for(var dx=-7;dx<=7;dx++)for(var dy=-3;dy<=3;dy++)for(var dz=-7;dz<=7;dz++) {
            var by=y+dy;if(by<0||by>255)continue;
            var value=w.l(new (Java.type('cj'))((x+dx)|0,by|0,(z+dz)|0));
            if(value!==15)light.push([dx,dy,dz,value]);
          }
          var event={variant:name==='t'?'brown':'red',x:x,y:y,z:z,start:activeCalls.length,light:light,checks:[]},draws=[];
          mushroomEvents.push(event);
          var block=Java.type('afh').c(name==='t'?39:40),previous=randomAfterInt;
          randomAfterInt=function(value,bound){
            draws.push(value);
            if(draws.length!==6)return;
            var bx=x+draws[0]-draws[1],by=y+draws[2]-draws[3],bz=z+draws[4]-draws[5],pos=new (Java.type('cj'))(bx|0,by|0,bz|0);
            event.checks.push({after:activeCalls.length,x:bx,y:by,z:bz,light:w.l(pos),rawLight:w.k(pos),stay:block.f(w,pos,block.Q()),place:block.d(w,pos)});draws=[];
          };
          try{return original.b(w,r,p);}finally{randomAfterInt=previous;}
        }});
        return new R();
      }
      var proxy=proxyFor(original,name);wrapped.put(proxy,true);field.set(decorator,proxy);
    }
  }
  function wrapTree(original) {
    if(wrapped.containsKey(original))return original;
    var name=String(original.getClass().getName()),T=Java.type(name);
    var R=Java.extend(T,{
      b:function(w,r,p){
        var event={type:name,x:coord(p,'x'),y:coord(p,'y'),z:coord(p,'z'),start:activeCalls.length};
        treeEvents.push(event);event.ok=original.b(w,r,p);event.end=activeCalls.length;return event.ok;
      },
      e:function(){original.e();},
      a:function(w,r,p){original['a(adm,java.util.Random,cj)'](w,r,p);}
    });
    var proxy=(name==='aoj'||name==='apf')?new R(false,false):(name==='apk'||name==='apt')?new R():new R(false);
    wrapped.put(proxy,true);return proxy;
  }
  function wrapFields(object) {
    for(var cls=object.getClass();cls!==null;cls=cls.getSuperclass())for each(var field in cls.getDeclaredFields()) {
      if(!Java.type('aoh').class.isAssignableFrom(field.getType()))continue;
      if(java.lang.reflect.Modifier.isStatic(field.getModifiers()))continue;
      field.setAccessible(true);var old=field.get(object);if(old!==null&&!wrapped.containsKey(old))field.set(object,wrapTree(old));
    }
  }
  var randomField=Java.type('adm').class.getDeclaredField('s');randomField.setAccessible(true);
  var originalRandom=randomField.get(world);
  function coord(p,n){return Number(p[n==='x'?'n':n==='y'?'o':'p']());}
  function snapshot(cx,cz) {
    var sections=[];
    for(var dz=-1;dz<=2;dz++)for(var dx=-1;dx<=2;dx++) {
      var ss=world['a(int,int)'](cx+dx,cz+dz).h();
      for(var sy=0;sy<16;sy++)sections.push(ss[sy]?Arrays['copyOf(char[],int)'](ss[sy].g(),4096):null);
    }
    return sections;
  }
  function nativeTrace(calls) {return {push:function(call){
    var stack=new java.lang.Throwable().getStackTrace(),source='';
    for each(var frame in stack)if(/^(ae|ao|ap)[a-z]($|\$)/.test(String(frame.getClassName()))) {source=String(frame.getClassName())+'.'+frame.getMethodName();break;}
    var record=call.concat([source]),key=record.join('|'),index=traceIds[key];
    if(index===undefined){index=traceTypes.length;traceIds[key]=index;traceTypes.push(record);}
    calls.push(index);
  }};}
  for(var id=0;id<256;id++) {
    var biome=registry[id];
    if(!biome||id===8||id===9)continue;
    var config={id:id,name:String(Biome.class.getField('ah').get(biome)),className:String(biome.getClass().getName()),counts:{}};
    for each(var field in Java.type('aeb').class.getDeclaredFields()) {
      if(String(field.getType().getName())!=='int')continue;
      field.setAccessible(true);config.counts[String(field.getName())]=Number(field.get(decoratorField.get(biome)));
    }
    configs.push(config);
    wrapFields(biome);
    wrapMushrooms(decoratorField.get(biome));
    for each(var seed in [1,7]) {
      var cx=seed===1?400:-400,cz=seed===1?400:-400,ox=cx*16,oz=cz*16;
      // Cover the +8-offset population area and the surrounding read halo.
      setup(cx,cz,63,32);setup(cx+1,cz+1,63,32);
      for(var dz=-1;dz<=2;dz++)for(var dx=-1;dx<=2;dx++) {
        var chunk=world['a(int,int)'](cx+dx,cz+dz);
        Arrays.fill(chunk.k(),Java.to([id>127?id-256:id],'byte[]')[0]);
      }
      var before=snapshot(cx,cz),calls=[],worldCalls=[],worldSeed=9000+seed;
      treeEvents=[];mushroomEvents=[];activeCalls=calls;
      var random=makeRand(seed,nativeTrace(calls));
      var worldRandom=makeRand(worldSeed,nativeTrace(worldCalls));randomField.set(world,worldRandom);
      try {decorate.invoke(biome,world,random,new (Java.type('cj'))(ox|0,0,oz|0));}
      finally {randomField.set(world,originalRandom);}
      var rngAfter=random.nextInt(),worldRngAfter=worldRandom.nextInt(),blocks=[],after=snapshot(cx,cz);
      for(var section=0;section<after.length;section++) {
        var a=after[section],b=before[section];
        if(a===null&&b===null||a!==null&&b!==null&&Arrays.equals(a,b))continue;
        var sy=section%16,ci=(section/16)|0,dx=ci%4-1,dz=((ci/4)|0)-1;
        for(var i=0;i<4096;i++) {
          var st=a===null?0:String(a[i]).charCodeAt(0),old=b===null?0:String(b[i]).charCodeAt(0);
          if(st!==old)blocks.push([dx*16+(i&15),sy*16+(i>>8),dz*16+((i>>4)&15),st]);
        }
      }
      var light=[];
      for(var lx=0;lx<32;lx++)for(var lz=0;lz<32;lz++) {
        var top=coord(world.m(new (Java.type('cj'))((ox+lx)|0,0,(oz+lz)|0)),'y');
        for(var ly=63;ly<=top;ly++) {var value=world.l(new (Java.type('cj'))((ox+lx)|0,ly|0,(oz+lz)|0));if(value!==15)light.push([lx,ly,lz,value]);}
      }
      cases.push({biome:id,seed:seed,x:ox,z:oz,terrain:'grass',light:light,mushrooms:mushroomEvents,trees:treeEvents,calls:calls,worldCalls:worldCalls,worldSeed:worldSeed,rngAfter:rngAfter,worldRngAfter:worldRngAfter,blocks:blocks});
      print('BIOME '+id+' seed '+seed+' changes '+blocks.length+' calls '+calls.length);
    }
  }
  return {configs:configs,traceTypes:traceTypes,cases:cases};
}
