import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { JavaRandom, javaStringHash, parseJavaLong, resolveJavaSeed } from '../client/js/local-world/java-random.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/java-random.json', import.meta.url), 'utf8'));
const bounds = [1, 2, 3, 16, 31, 1073741825, 2147483647];

test('integer, bounded, long, boolean, float, double and byte sequences match JDK output', () => {
  for (const row of fixture.random) {
    const random = new JavaRandom(BigInt(row.seed));
    assert.deepEqual(row.ints.map(() => random.nextInt()), row.ints, row.seed);
    assert.deepEqual(bounds.map(bound => random.nextInt(bound)), row.bounded, row.seed);
    assert.deepEqual(row.longs.map(() => String(random.nextLong())), row.longs, row.seed);
    assert.equal(random.nextBoolean(), row.boolean, row.seed);
    assert.equal(random.nextFloat(), row.float, row.seed);
    assert.equal(random.nextDouble(), row.double, row.seed);
    const bytes = new Uint8Array(row.bytes.length);
    random.nextBytes(bytes);
    assert.deepEqual([...bytes], row.bytes, row.seed);
    for (const expected of row.gaussians) {
      assert.ok(Math.abs(random.nextGaussian() - expected) < 1e-14, row.seed);
    }
    random.setSeed(BigInt(row.seed));
    assert.equal(random.nextInt(), row.ints[0]);
    const fresh = new JavaRandom(BigInt(row.seed));
    random.setSeed(BigInt(row.seed));
    assert.equal(random.nextGaussian(), fresh.nextGaussian());
  }
});

test('Java UTF-16 string hashes and signed decimal parsing match JDK fixtures', () => {
  for (const { units, hash, long } of fixture.strings) {
    const text = String.fromCharCode(...units);
    assert.equal(javaStringHash(text), hash);
    assert.equal(parseJavaLong(text)?.toString() ?? null, long);
    const resolved = resolveJavaSeed(text, () => '1234567890123456789');
    const expected = text === '' || long === '0' ? '1234567890123456789' : long ?? String(hash);
    assert.equal(resolved, expected);
  }
  assert.equal(resolveJavaSeed('4294967303'), '4294967303');
  assert.equal(resolveJavaSeed(' 7 '), String(javaStringHash(' 7 ')));
  assert.equal(resolveJavaSeed('000', () => '7'), '7');
});

test('random inputs reject invalid bounds and unsafe Number seeds', () => {
  const random = new JavaRandom(7n);
  for (const bound of [0, -1, 1.5, 2147483648, NaN]) assert.throws(() => random.nextInt(bound), RangeError);
  for (const bits of [0, 33, 1.5, NaN]) assert.throws(() => random.next(bits), RangeError);
  assert.throws(() => new JavaRandom(9007199254740992), /BigInt/);
  assert.throws(() => resolveJavaSeed('x'.repeat(81)), /80/);
});
