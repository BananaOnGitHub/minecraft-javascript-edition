import java.io.PrintStream;
import java.lang.reflect.*;
import java.util.*;

/** Black-box calls into a locally supplied 1.8.9 dedicated server.
 * No game implementation or assets are included. Names below are runtime ABI
 * identifiers for this version, discovered using reflection, not source code.
 * Compile with a Java 8 compatible compiler and run with server.jar on -cp.
 */
public final class VanillaGenerationFixture {
    static final PrintStream output = System.out;
    static final long[] SEEDS = {0L, 1L, -1L, 7L, -7L, Long.MAX_VALUE,
        Long.MIN_VALUE, 1234567890123456789L};
    static void array(int[] values, int length) {
        output.print('[');
        for (int i=0; i<length; i++) { if (i>0) output.print(','); output.print(values[i]); }
        output.print(']');
    }
    static void array(double[] values) {
        output.print('[');
        for (int i=0; i<values.length; i++) { if (i>0) output.print(','); output.print(values[i]); }
        output.print(']');
    }
    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("biomes or noise");
        if (args[0].equals("biomes")) biomes();
        else if (args[0].equals("noise")) noise();
        else throw new IllegalArgumentException("Unknown fixture stage");
    }
    static void biomes() throws Exception {
        Class.forName("kb").getMethod("c").invoke(null); // bootstrap registries
        Class<?> type = Class.forName("adr"), layer = Class.forName("ase");
        Object def = type.getMethod("a",String.class).invoke(null,"default");
        Method graph = layer.getMethod("a",long.class,type,String.class);
        Method sample = layer.getMethod("a",int.class,int.class,int.class,int.class);
        int[][] origins = {{-129,-129},{-2,-2},{11111,-9999},{-4096,8192}};
        output.print('['); boolean first=true;
        for (long seed: SEEDS) for (int scale: new int[]{1,4}) for (int[] xy: origins) {
            if (!first) output.print(','); first=false;
            Object[] layers = (Object[])graph.invoke(null,seed,def,"");
            int[] values = (int[])sample.invoke(layers[scale==1?1:0],xy[0],xy[1],32,32);
            output.print("{\"seed\":\""+seed+"\",\"scale\":"+scale+",\"x\":"+xy[0]+",\"z\":"+xy[1]+",\"width\":32,\"height\":32,\"values\":");
            array(values,32*32); output.print('}');
        }
        output.println(']');
    }
    static void noise() throws Exception {
        Class<?> perlin = Class.forName("arb"), simplex = Class.forName("arg");
        Method p = perlin.getMethod("a",double[].class,double.class,double.class,double.class,
            int.class,int.class,int.class,double.class,double.class,double.class,double.class);
        Method s = simplex.getMethod("a",double[].class,double.class,double.class,
            int.class,int.class,double.class,double.class,double.class);
        output.print('['); boolean first=true;
        for (long seed: SEEDS) for (int mode=0; mode<5; mode++) {
            if (!first) output.print(','); first=false;
            double x=-16.75,y=-3,z=32.125,sx=0.125,sy=0.125,sz=0.25,amplitude=0.5;
            int nx=5,ny=mode==0?1:9,nz=7;
            double[] values=new double[mode==2||mode==4?nx*nz:nx*ny*nz];
            String kind=mode==2?"simplex":mode==3?"perlin-octaves":mode==4?"simplex-octaves":"perlin";
            if(mode<3) {
                Object gen=(mode==2?simplex:perlin).getConstructor(Random.class).newInstance(new Random(seed));
                if(mode==2)s.invoke(gen,values,x,z,nx,nz,sx,sz,amplitude);
                else p.invoke(gen,values,x,y,z,nx,ny,nz,sx,sy,sz,amplitude);
            } else if(mode==3) {
                x=-33554433;z=33554432;
                Class<?> octaves=Class.forName("arc");
                Object gen=octaves.getConstructor(Random.class,int.class).newInstance(new Random(seed),4);
                values=(double[])octaves.getMethod("a",double[].class,int.class,int.class,int.class,int.class,int.class,int.class,double.class,double.class,double.class)
                    .invoke(gen,values,(int)x,(int)y,(int)z,nx,ny,nz,sx,sy,sz);
            } else {
                Class<?> octaves=Class.forName("ard");
                Object gen=octaves.getConstructor(Random.class,int.class).newInstance(new Random(seed),4);
                values=(double[])octaves.getMethod("a",double[].class,double.class,double.class,int.class,int.class,double.class,double.class,double.class,double.class)
                    .invoke(gen,values,x,z,nx,nz,sx,sz,0.5,0.5);
            }
            output.print("{\"kind\":\""+kind+"\",\"seed\":\""+seed+"\",\"x\":"+x+",\"y\":"+y+",\"z\":"+z+",\"nx\":"+nx+",\"ny\":"+ny+",\"nz\":"+nz+",\"sx\":"+sx+",\"sy\":"+sy+",\"sz\":"+sz+",\"amplitude\":"+amplitude+",\"values\":");
            array(values); output.print('}');
        }
        output.println(']');
    }
}
