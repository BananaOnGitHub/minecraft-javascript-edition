import { JavaRandom as VisualRandom } from '../util/jrandom.js';

// Reuse the client's LCG while adding validation and the remaining public JDK
// operations needed by generation and file-format compatibility tools.
export class JavaRandom extends VisualRandom {
  setSeed(seed) {
    if (typeof seed === 'number' && !Number.isSafeInteger(seed)) throw new RangeError('Use BigInt for a 64-bit seed.');
    super.setSeed(seed);
    this.gaussian = null;
  }

  next(bits) {
    if (!Number.isInteger(bits) || bits < 1 || bits > 32) throw new RangeError('Random bit count must be 1–32.');
    return super.next(bits);
  }

  nextInt(bound) {
    if (bound !== undefined && (!Number.isInteger(bound) || bound <= 0 || bound > 0x7fffffff)) {
      throw new RangeError('Random bound must be a positive signed 32-bit integer.');
    }
    return super.nextInt(bound);
  }

  nextLong() {
    // Both halves are signed ints before Java's promotion to long and addition.
    return BigInt.asIntN(64, (BigInt(this.next(32)) << 32n) + BigInt(this.next(32)));
  }

  nextBoolean() {
    return this.next(1) !== 0;
  }

  nextBytes(bytes) {
    for (let offset = 0; offset < bytes.length;) {
      let value = this.nextInt();
      const end = Math.min(offset + 4, bytes.length);
      while (offset < end) {
        bytes[offset++] = value & 255;
        value >>= 8;
      }
    }
  }

  nextGaussian() {
    if (this.gaussian !== null) {
      const value = this.gaussian;
      this.gaussian = null;
      return value;
    }
    let x, y, radius;
    do {
      x = 2 * this.nextDouble() - 1;
      y = 2 * this.nextDouble() - 1;
      radius = x * x + y * y;
    } while (radius >= 1 || radius === 0);
    const scale = Math.sqrt(-2 * Math.log(radius) / radius);
    this.gaussian = y * scale;
    return x * scale;
  }
}

const MIN_LONG = -(1n << 63n);
const MAX_LONG = (1n << 63n) - 1n;

// Decimal digit starts supported by Character.digit(char, 10) in Java 8
// (Unicode 6.2). Supplementary characters arrive as surrogate chars in Java.
const DIGIT_STARTS = [
  0x0030, 0x0660, 0x06f0, 0x07c0, 0x0966, 0x09e6, 0x0a66, 0x0ae6,
  0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0e50, 0x0ed0, 0x0f20,
  0x1040, 0x1090, 0x17e0, 0x1810, 0x1946, 0x19d0, 0x1a80, 0x1a90,
  0x1b50, 0x1bb0, 0x1c40, 0x1c50, 0xa620, 0xa8d0, 0xa900, 0xa9d0,
  0xaa50, 0xabf0, 0xff10,
];

export function parseJavaLong(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  const negative = text[0] === '-';
  let offset = negative || text[0] === '+' ? 1 : 0;
  if (offset === text.length) return null;
  let value = 0n;
  for (; offset < text.length; offset++) {
    const code = text.charCodeAt(offset);
    const start = DIGIT_STARTS.find(start => code >= start && code < start + 10);
    if (start === undefined) return null;
    value = value * 10n + BigInt(code - start);
    if (value > MAX_LONG + (negative ? 1n : 0n)) return null;
  }
  value = negative ? -value : value;
  return value >= MIN_LONG && value <= MAX_LONG ? value : null;
}

export function javaStringHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (Math.imul(hash, 31) + text.charCodeAt(i)) | 0;
  return hash;
}

export function randomLong() {
  const words = crypto.getRandomValues(new Uint32Array(2));
  return BigInt.asIntN(64, (BigInt(words[0]) << 32n) | BigInt(words[1])).toString();
}

export function resolveJavaSeed(input = '', random = randomLong) {
  if (typeof input !== 'string' || input.length > 80) throw new Error('Enter a seed of up to 80 characters.');
  if (input === '') return random();
  const value = parseJavaLong(input);
  if (value === 0n) return random();
  return value === null ? String(javaStringHash(input)) : value.toString();
}
