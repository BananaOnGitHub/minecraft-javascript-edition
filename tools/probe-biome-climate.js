// Observe numeric biome climate properties through the public registry.
function captureBiomeDecoration(world,setup,getEncoded,rawSet,makeRand) {
 var Biome=Java.type('ady'),field=Biome.class.getDeclaredField('aE');field.setAccessible(true);
 var registry=field.get(null),observed=[];
 for(var id=0;id<registry.length;id++)if(registry[id]!==null)observed.push([id,Biome.class.getField('ap').getFloat(registry[id])]);
 return {cases:[{biomes:observed}]};
}
