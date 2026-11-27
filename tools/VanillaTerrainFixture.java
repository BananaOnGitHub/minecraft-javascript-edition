import java.io.*;
import java.lang.reflect.*;
import java.util.*;
import java.util.zip.GZIPOutputStream;

/** Runs an unmodified local 1.8.9 server and captures generator outputs at
 * shutdown, after ticks have stopped. Use ONLY in a disposable reference world.
 * Reflection accesses runtime fields and invokes stage methods, without
 * decompiling, patching, or including game implementation code.
 */
public final class VanillaTerrainFixture {
    static Object field(Object object,String name) throws Exception {
        Field f=object.getClass().getDeclaredField(name);f.setAccessible(true);return f.get(object);
    }
    static Object generator(Object object,int depth,Set<Object> visited) throws Exception {
        if(object==null||!visited.add(object))return null;
        if(object.getClass().getName().equals("aoa"))return object;
        if(depth==0)return null;
        for(Class<?> c=object.getClass();c!=null;c=c.getSuperclass())for(Field f:c.getDeclaredFields()) {
            if(Modifier.isStatic(f.getModifiers())||f.getType().isPrimitive()||f.getType().isArray()||f.getType().getName().contains("."))continue;
            f.setAccessible(true);Object found=generator(f.get(object),depth-1,visited);if(found!=null)return found;
        }
        return null;
    }
    static int[] primer(Object object) throws Exception {
        short[] data=(short[])field(object,"a");int[] out=new int[65536];
        for(int x=0;x<16;x++)for(int z=0;z<16;z++)for(int y=0;y<256;y++)out[y*256+z*16+x]=data[(x*16+z)*256+y]&65535;
        return out;
    }
    static void rle(PrintWriter out,int[] values) {
        out.print('[');boolean first=true;
        for(int i=0;i<values.length;) {
            int start=i,value=values[i++];while(i<values.length&&values[i]==value)i++;
            if(!first)out.print(',');first=false;out.print(value+","+(i-start));
        }
        out.print(']');
    }
    static void array(PrintWriter out,double[] values) {
        out.print('[');for(int i=0;i<values.length;i++){if(i>0)out.print(',');out.print(values[i]);}out.print(']');
    }
    static void capture(String path,long seed) throws Exception {
        Class<?> serverClass=Class.forName("net.minecraft.server.MinecraftServer");
        Field singleton=serverClass.getDeclaredField("l");singleton.setAccessible(true);
        Object server=singleton.get(null),world=((Object[])serverClass.getField("d").get(server))[0];
        Object gen=generator(world,3,Collections.newSetFromMap(new IdentityHashMap<Object,Boolean>()));
        if(gen==null)throw new IllegalStateException("Default chunk provider unavailable");
        Class<?> provider=gen.getClass(),primerClass=Class.forName("ans"),biomeClass=Class.forName("ady");
        Method raw=provider.getMethod("a",int.class,int.class,primerClass);
        Class<?> type=Class.forName("adr"),layer=Class.forName("ase");
        Object def=type.getMethod("a",String.class).invoke(null,"default");
        Object[] graph=(Object[])layer.getMethod("a",long.class,type,String.class).invoke(null,seed,def,"");
        Method sample=layer.getMethod("a",int.class,int.class,int.class,int.class);
        Method lookup=biomeClass.getMethod("e",int.class);
        Method surface=provider.getMethod("a",int.class,int.class,primerClass,Array.newInstance(biomeClass,0).getClass());
        Random random=(Random)field(gen,"h");
        int[][] coords={{0,0},{-1,-1},{-1,0},{0,-1},{1,1},{-17,16},{16,-17},{-697,625}};
        try(PrintWriter out=new PrintWriter(new OutputStreamWriter(new GZIPOutputStream(new FileOutputStream(path)),"UTF-8"))) {
            out.print("{\"seed\":\""+seed+"\",\"columns\":[");
            boolean first=true;
            for(int[] coord:coords) {
                int x=coord[0],z=coord[1];
                random.setSeed((long)x*341873128712L+(long)z*132897987541L);
                Object primer=primerClass.getConstructor().newInstance();
                raw.invoke(gen,x,z,primer);
                if(!first)out.print(',');first=false;
                out.print("{\"x\":"+x+",\"z\":"+z+",\"density\":");array(out,(double[])field(gen,"p"));
                out.print(",\"raw\":");rle(out,primer(primer));
                int[] biomeIds=(int[])sample.invoke(graph[1],x*16,z*16,16,16);
                Object biomes=Array.newInstance(biomeClass,256);
                for(int i=0;i<256;i++)Array.set(biomes,i,lookup.invoke(null,biomeIds[i]));
                surface.invoke(gen,x,z,primer,biomes);
                out.print(",\"surface\":");rle(out,primer(primer));
                out.print(",\"biomes\":");rle(out,Arrays.copyOf(biomeIds,256));
                Object chunk=provider.getMethod("d",int.class,int.class).invoke(gen,x,z);
                Object[] sections=(Object[])chunk.getClass().getMethod("h").invoke(chunk);
                int[] blocks=new int[65536];
                for(int section=0;section<sections.length;section++)if(sections[section]!=null) {
                    char[] states=(char[])sections[section].getClass().getMethod("g").invoke(sections[section]);
                    for(int i=0;i<4096;i++)blocks[section*4096+i]=states[i];
                }
                out.print(",\"unpopulated\":");rle(out,blocks);out.print('}');
            }
            out.print("],\"biomeParameters\":[");first=true;
            for(int id=0;id<256;id++) {
                Object biome=lookup.invoke(null,id);if(biome==null)continue;
                // Missing registry entries return a fallback; include registered IDs only.
                if(biomeClass.getField("az").getInt(biome)!=id)continue;
                if(!first)out.print(',');first=false;
                out.print("["+id+","+biomeClass.getField("an").getFloat(biome)+","+biomeClass.getField("ao").getFloat(biome)+"]");
            }
            out.print("]}");
        }
    }
    public static void main(String[] args)throws Exception {
        if(args.length!=2)throw new IllegalArgumentException("ABSOLUTE_OUTPUT_GZIP RESOLVED_SEED");
        final String path=args[0];final long seed=Long.parseLong(args[1]);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try{capture(path,seed);}catch(Throwable error){error.printStackTrace();}
        },"generation-fixture"));
        Class.forName("net.minecraft.server.MinecraftServer").getMethod("main",String[].class).invoke(null,(Object)new String[]{"nogui"});
    }
}
