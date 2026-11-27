# Native Default generation, Java 1.8.9

The new implementation lives in `client/js/local-world/generation/v1_8_9/`.
Its reserved identifier is `java-1.8.9-default-v1`. It is under development and
is not registered as a playable generator yet. Existing `landscape-v1`, flat,
and terrace worlds keep their original generators and saved columns.

## Verified stages

`Biomes189` implements the Default climate, biome, Hills, mutation, shore,
river, smoothing, and legacy Voronoi layer graph. Scale 4 returns the biome
grid used by terrain density sampling. Scale 1 returns saved block biomes.
Coordinates are expressed in the selected grid. Seeds must be exact decimal
strings or BigInts. Per-query memoization is released after each query.

* Local 1.8.9 server Anvil comparison, seeds 7 and -7: 563,712 / 563,712 biome
  values matched across 2,202 columns, including 146 unpopulated columns.
* Additional direct calls into the local server: 65,536 / 65,536 biome values
  matched, both resolutions, eight seeds, negative coordinates and boundaries.
  Seeds include zero, both signed long limits, and 1234567890123456789.
* Independent Cubiomes check: 73,920 / 73,920 values matched at both resolutions,
  including rectangles with odd sizes that the vanilla Voronoi buffer does not
  support in all alignments.

These results establish biome-stage agreement only. Heightmaps, density,
surface blocks, caves, ores, decoration, and structures are separate stages.
Whole-column agreement including shared air is not evidence of terrain parity.

Improved Perlin (2D and 3D bulk paths), simplex, and both octave samplers match
5,880 / 5,880 native double values exactly across the same eight seeds. Octave
fixtures include coordinates beyond the 2^24 wrapping period. The legacy bulk
sampler caches Y gradients within a lattice cell; independent point sampling
would change these results.

## Reference reproduction

Run `npm run test:default-generation` for checked-in numerical fixtures.
No game jar is required for the tests. `tools/VanillaGenerationFixture.java`
uses reflection to invoke the locally supplied dedicated server as a black-box
behavioral reference. Its runtime ABI names target 1.8.9 only. It contains no
game source. Fixture metadata records the local jar SHA-256.

With a Java 8 compatible compiler and runtime:

```sh
javac -d /tmp/vanilla-fixtures tools/VanillaGenerationFixture.java
java -cp /tmp/vanilla-fixtures:/path/to/1.8.9/server.jar VanillaGenerationFixture biomes > /tmp/biomes.json
java -cp /tmp/vanilla-fixtures:/path/to/1.8.9/server.jar VanillaGenerationFixture noise > /tmp/noise.json
```

Only the first `width * height` values returned by vanilla are valid. Its
IntCache may return a larger array. Regenerate compact biome fixtures using
run-length pairs `(biome ID, count)` in row-major Z/X order.

For saved reference worlds:

```sh
node tools/compare-default-biomes.mjs /path/to/world -7 /tmp/biome-report.json
```

This reads every saved Anvil column without changing the world, counts
unpopulated columns separately, and reports unavailable downstream metrics as
null. It exits unsuccessfully on a mismatch or an empty reference world.

## Derivation and licensing

Biome algorithms are adapted from the independent MIT-licensed
[Cubiomes](https://github.com/Cubitect/cubiomes), commit
`e61f90580cbdd883214a8054670dacae655e59c0`, specifically the 1.8 layer path in
`generator.c`, `layers.c`, `rng.h`, and `biomes.c`. The notice is preserved in
`third-party/cubiomes/LICENSE`. Later-version branches were excluded.

Noise sampling loops are adapted from the independent MIT-licensed
[Glowstone](https://github.com/GlowstoneMC/Glowstone), commit
`e9aeaa46330326f0d3917dce8f9bc4cdd1e434bd`, with native fixtures determining
1.8.9 random consumption, divisor semantics, wrapping, and accumulation order.
Its notice is preserved in `third-party/glowstone/LICENSE`.

The layer PRNG is distinct from `java.util.Random`. It uses signed 64-bit
wrapping polynomial steps, arithmetic shifts, and corrected signed remainder.
The pre-1.13 Hills zoom branch deliberately retains its uninitialized seed.
Negative division uses floor semantics. Mesa similarity remains asymmetric.

## Remaining dependency order

1. Implement and validate density, biome elevation blending, and interpolation.
2. Implement and validate surfaces, oceans, sea level, and bedrock.
3. Implement caves and ravines, then ores, then biome vegetation and decoration.
4. Implement structures and population with explicit legacy order semantics.
5. Register the new generator only with an honest supported-stage contract,
   preserving old generator IDs and stored columns. Measure worker latency and
   memory once complete column generation is available.
