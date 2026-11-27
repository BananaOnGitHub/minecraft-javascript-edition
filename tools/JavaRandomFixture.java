import java.util.Random;

// Reference fixture generator. Uses only standard JDK APIs.
public class JavaRandomFixture {
    public static void main(String[] args) {
        long[] seeds = {0L, 1L, -1L, 7L, Long.MIN_VALUE, Long.MAX_VALUE, 4294967303L};
        int[] bounds = {1, 2, 3, 16, 31, 1073741825, Integer.MAX_VALUE};
        System.out.println("{\"source\":\"JDK java.util.Random and String.hashCode\",\"random\":[");
        boolean first = true;
        for (long seed : seeds) {
            Random r = new Random(seed);
            if (!first) System.out.println(",");
            first = false;
            System.out.print("{\"seed\":\"" + seed + "\",\"ints\":[");
            for (int i = 0; i < 12; i++) {
                if (i > 0) System.out.print(",");
                System.out.print(r.nextInt());
            }
            System.out.print("],\"bounded\":[");
            for (int i = 0; i < bounds.length; i++) {
                if (i > 0) System.out.print(",");
                System.out.print(r.nextInt(bounds[i]));
            }
            System.out.print("],\"longs\":[");
            for (int i = 0; i < 5; i++) {
                if (i > 0) System.out.print(",");
                System.out.print("\"" + r.nextLong() + "\"");
            }
            System.out.print("],\"boolean\":" + r.nextBoolean());
            System.out.print(",\"float\":" + (double) r.nextFloat());
            System.out.print(",\"double\":" + r.nextDouble());
            byte[] bytes = new byte[11];
            r.nextBytes(bytes);
            System.out.print(",\"bytes\":[");
            for (int i = 0; i < bytes.length; i++) {
                if (i > 0) System.out.print(",");
                System.out.print(bytes[i] & 255);
            }
            System.out.print("],\"gaussians\":[");
            for (int i = 0; i < 5; i++) {
                if (i > 0) System.out.print(",");
                System.out.print(r.nextGaussian());
            }
            System.out.print("]}");
        }
        System.out.print("],\"strings\":[");
        String[] strings = {"", "0", "-0", "+0007", " 7 ", "seed", "\uD83C\uDF32", "\uD800",
                "9223372036854775807", "-9223372036854775808", "9223372036854775808",
                "\u0667", "\uff17", "\uD835\uDFD5"};
        first = true;
        for (String text : strings) {
            if (!first) System.out.print(",");
            first = false;
            System.out.print("{\"units\":[");
            for (int i = 0; i < text.length(); i++) {
                if (i > 0) System.out.print(",");
                System.out.print((int) text.charAt(i));
            }
            System.out.print("],\"hash\":" + text.hashCode() + ",\"long\":");
            try {
                System.out.print("\"" + Long.parseLong(text) + "\"");
            } catch (NumberFormatException error) {
                System.out.print("null");
            }
            System.out.print("}");
        }
        System.out.println("]}");
    }
}
