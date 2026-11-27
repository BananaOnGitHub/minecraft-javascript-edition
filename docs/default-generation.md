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

`DefaultTerrain189.density(cx, cz)` and `rawColumn(cx, cz)` now implement the
Default density lattice, float-precision biome height blending, depth noise,
and repeated-addition interpolation into stone, water, and air. The checked-in
native terrain fixtures contain 32 columns from four seeds (7, -7, signed long
maximum and minimum), including adjacent chunks, both sides of region borders,
and a distant coordinate. Results are 26,400 / 26,400 density doubles exactly
equal and 2,097,152 / 2,097,152 raw block states exactly equal. Raw heightmaps
therefore match at all 8,192 tested X/Z positions. These fixtures capture each
stage directly, before surface replacement and before population.

`surfaceColumn(cx, cz)` adds biome-specific ground, sand/sandstone, snow and
ice surfaces, swamp water/lilies, Mesa bands/pillars, and bedrock. All 86 natural
reference columns match density and surface states exactly (70,950 density
doubles, 5,636,096 block states, 22,016 height samples, and 110,080 bottom-five
bedrock-mask positions). A separate synthetic fixture exercises all 59
Overworld biomes over varying heights, water, and overhangs at three coordinates:
177 / 177 cases and 11,599,872 / 11,599,872 states match exactly.

Special cases include the 1.8 sandstone transition for depth-one sand, local
coordinate transposition in surface callbacks, snow blocks on ice spikes,
and Mesa's X/X band-offset sampling. Mesa pillar noise is initialized from zero
on a fresh native biome singleton, before the cached world seed is updated.
This implementation reproduces a fresh-process world independently of other
worlds visited in the same browser, without process-history dependence.

`carvedColumn(cx, cz)` adds independently implemented legacy caves and ravines.
Both separate stages match all 86 native reference columns exactly, each
5,636,096 / 5,636,096 states. Tests also require nonempty carve masks and cover
water-blocked rooms, cross-chunk paths, lava state differences (still lava for
caves, flowing lava for ravines), sandstone above openings, and surface repair.
The implementation uses a float sine lookup table, exact Java RNG streams,
signed long chunk mixing, and repeated float rounding in the walk. Request order
tests include Mesa and water-boundary cases. These are carved-stage results;
they do not establish structure or fully populated parity.

## Reference reproduction

The handed-off ore and tree modules are also covered by the generation suite.
The large-oak instance lifecycle correction and reproducible black-box probe
are documented in [big-oak-generation.md](big-oak-generation.md). Shared and
fresh instances are tested separately; the handoff fixture's numerical block
data is preserved. These isolated feature checks do not establish full
decoration or population parity.

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
node tools/compare-default-generation.mjs tools/fixtures/vanilla-189-diverse-terrain.json.gz /tmp/terrain-report.json
```

This reads every saved Anvil column without changing the world, counts
unpopulated columns separately, and reports unavailable downstream metrics as
null. It exits unsuccessfully on a mismatch or an empty reference world.

`VanillaTerrainFixture.java` wraps the local server entry point and invokes its
actual Default provider in a shutdown hook after server ticks have stopped.
It captures density, raw terrain, surface replacement, and unpopulated provider
chunks separately. It does not synthesize the native density inputs. The full
server constructor supplies its real noise objects, settings, and biome weights.
To regenerate, compile both Java fixture classes and run:

```sh
node tools/create-native-terrain-fixtures.mjs /path/to/server.jar /path/to/java /tmp/vanilla-fixtures /path/to/accepted/eula.txt /tmp/new-reference-directory 7 -7 9223372036854775807 -9223372036854775808
```

The runner refuses an existing output directory and copies an already accepted
local EULA. It uses disposable worlds, an ephemeral loopback port, and preserves
the supplied server and existing worlds. Gzipped JSON fixtures contain numerical
behavioral outputs only, with row-major Y/Z/X block-state runs and X/Z/Y density
arrays. No game assets or implementation code are included.

`--coordinates CSV_FILE` selects additional chunk coordinates for the reference
runner. Each line begins `chunkX,chunkZ`. Captures also produce a diagnostic
`.surfaces.gz` sibling containing all registered Overworld surface callbacks on
the same synthetic input. The comparison command reports density, heightmaps,
biomes, full states, non-air states, and bedrock separately. Carved unpopulated
and populated parity remain unavailable until those implementations exist.

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

1. Complete isolated biome vegetation and decoration features. Standard ore
   generation and individual tree generators are implemented and tested.
2. Implement structures and population with explicit legacy order semantics.
3. Register the new generator only with an honest supported-stage contract,
   preserving old generator IDs and stored columns. Measure worker latency and
   memory once complete column generation is available.

## Isolated decoration features

`generateDoublePlant189(world, random, x, y, z, variant)` in `decoration.js`
generates one double-plant patch using synchronous `world.get` / `world.set`
with 1.8 block states. The caller supplies the plant variant (0–5) and RNG.
All 54 isolated vanilla fixtures match block coordinates, metadata, return
values and post-call RNG. They cover six variants, three seeds, two elevations,
grass, dirt, farmland and stone, and positions straddling chunk boundaries.
They do not yet cover obstructed upper blocks or broader biome placement
rules. This is a biome decorator feature; choosing variants and ordering its
calls are separate responsibilities. Lakes, dungeons and structures belong to
separate population stages, not this feature.

The double-plant loop was independently adapted from the MIT-licensed
Glowstone `DoubleTallPlant.java` at commit
`e9aeaa46330326f0d3917dce8f9bc4cdd1e434bd`, and corrected against the local
unmodified 1.8.9 server. `third-party/glowstone/LICENSE` carries its notice.
`tools/probe-decoration.js` captures numerical behavior without decompiling or
modifying the server. Regenerate its fixture in a disposable world with:

```sh
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/decoration.json.gz
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/patches.json.gz patches
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/aquatic.json.gz aquatic
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/reeds.json.gz reeds
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/deposits.json.gz deposits
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/grass.json.gz grass
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/plants.json.gz plants
```

The fixtures record the server and probe SHA-256 hashes.
`generateFlowerPatch189(world, random, x, y, z, state, canPlace)` independently
places a 64-attempt patch, with caller-supplied block state and placement
predicate for biome/light requirements. `generateCactusPatch189(world, random,
x, y, z, isSolid)` uses a caller-supplied solid-block predicate. Both match
24 native fixture cases in total over three seeds, two elevations and two
surfaces, including failed attempts and caller RNG state. These isolated cases
do not validate biome flower choice, real light, or obstructed environments.
The implementations were adapted from Glowstone's MIT `Flower.java` and
`Cactus.java`, with legacy random consumption and geometry corrected against
native outputs. Cactus uses ten scatter attempts per invocation. The capture
also includes mushroom observations but these have not yet been validated.

`generateWaterLilyPatch189` and `generateSugarCanePatch189` each match 12
isolated native cases including failed attempts, three seeds, two elevations,
cross-chunk coordinates, and post-call RNG. Cane fixtures use alternating
water and grass/sand, and include successful multi-block growth. These functions
use the same synchronous world accessor as the other isolated generators.
They do not cover all obstructed, flowing-water, or mixed-terrain conditions.
Sugar cane was adapted from MIT-licensed Glowstone `SugarCane.java`, with patch
sampling and random consumption verified against the native probe. Lilies were
independently implemented against the numerical observations.

`generateSedimentDeposit189(world, random, x, y, z, kind)` supports `clay`,
`sand`, and `gravel` patches. Its cylindrical geometry draws on Glowstone's
MIT `BlockPatch.java`; native observations determine water gating, radius,
vertical depth, replaceable blocks, return value, and random consumption. All
18 fixture cases match, covering three seeds, wet and dry origins, and chunk
edges with a dirt substrate. Sand substrates, moving water, and mixed material
layers still need reference coverage. Spring generators remain separate.

`generateTallGrassPatch189` handles grass and ferns and matches 18 isolated
native cases covering three seeds, two elevations, grass and sand substrates,
and chunk boundaries. It descends through air or leaves before scattering;
leaf-canopy and obstruction cases need further coverage. The algorithm was
adapted from the MIT Glowstone `TallGrass.java` and corrected with reference
fixtures for legacy placement order and RNG consumption.

`generateDeadBushPatch189` and `generateFruitPatch189` (pumpkin/melon) match
36 native cases across three seeds, grass and sand, two starting elevations,
chunk boundaries, block metadata, and post-call RNG. The native pumpkin
facing encoding differs from the raw random choice. These isolated functions
were adapted from MIT Glowstone `DeadBushDecorator`, `PumpkinDecorator`, and
`MelonDecorator`, with their individual feature behavior checked against the
native server. Other soils, light, and obstructions require additional checks.
Runtime feature class names for probes were identified using the 1.8.9 class
mapping in [Zffu/mappings](https://github.com/Zffu/mappings).

Springs, flowers' biome selection, vines, mushrooms, giant mushrooms, and biome-specific
features remain unimplemented and unvalidated. The population planner's semantics
differ from legacy population; these independent features are not connected to it.
