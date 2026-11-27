import java.util.Random;

// Independent Java arithmetic and java.util.Random reference, no game source.
public class PopulationSeedFixture {
    public static void main(String[] args) {
        long[] seeds = {0L, 1L, -1L, 7L, -7L, Long.MIN_VALUE, Long.MAX_VALUE, 4294967303L};
        int[][] chunks = {{0,0},{1,1},{-1,-1},{17,-31},{-17,31},
                          {Integer.MIN_VALUE,Integer.MAX_VALUE},{Integer.MAX_VALUE,Integer.MIN_VALUE}};
        System.out.print("{\"source\":\"JDK java.util.Random and signed long arithmetic\",\"cases\":[");
        boolean first = true;
        for (long seed : seeds) for (int[] chunk : chunks) {
            Random r = new Random(seed);
            long mx = r.nextLong() / 2L * 2L + 1L;
            long mz = r.nextLong() / 2L * 2L + 1L;
            long mixed = (chunk[0] * mx + chunk[1] * mz) ^ seed;
            r.setSeed(mixed);
            if (!first) System.out.print(",");
            first = false;
            System.out.print("{\"worldSeed\":\"" + seed + "\",\"chunkX\":" + chunk[0] +
              ",\"chunkZ\":" + chunk[1] + ",\"populationSeed\":\"" + mixed +
              "\",\"nextInt\":" + r.nextInt() + ",\"nextLong\":\"" + r.nextLong() + "\"}");
        }
        System.out.println("]}");
    }
}
