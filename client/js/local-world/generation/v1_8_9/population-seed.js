// Legacy population RNG initialization. Coordinates are chunk coordinates.
import {JavaRandom} from '../../java-random.js';

const MIN_LONG = -(1n << 63n), MAX_LONG = (1n << 63n) - 1n;

export function populationSeed189(worldSeed, chunkX, chunkZ) {
  if (typeof worldSeed !== 'bigint' || worldSeed < MIN_LONG || worldSeed > MAX_LONG)
    throw new RangeError('World seed must be a signed 64-bit BigInt');
  if (![chunkX, chunkZ].every(n => Number.isInteger(n) && n >= -2147483648 && n <= 2147483647))
    throw new RangeError('Chunk coordinates must be signed 32-bit integers');
  const random = new JavaRandom(worldSeed);
  // BigInt division and Java long division both truncate toward zero.
  const xMultiplier = random.nextLong() / 2n * 2n + 1n;
  const zMultiplier = random.nextLong() / 2n * 2n + 1n;
  return BigInt.asIntN(64, (BigInt(chunkX) * xMultiplier + BigInt(chunkZ) * zMultiplier) ^ worldSeed);
}
