# Native Default generation, Java 1.8.9

The new implementation lives in `client/js/local-world/generation/v1_8_9/`.
Its reserved identifier is `java-1.8.9-default-v1`. It is under development and
is not registered as a playable generator yet. Existing `landscape-v1`, flat,
and terrace worlds keep their original generators and saved columns.

## Settled gameplay lighting

The experimental adapter now derives settled gameplay sky/block arrays in a
separate read-only lighting view. Population-time cached lighting and all
existing numerical fixtures remain unchanged. The reported seed
`-321252946616194827` reproduces 338 initially dark exposed positions around
`(123,75,1)`; native maintenance and the new view agree exactly. Seven base and
three edited reference states cover 79,360 positions with zero sky or block-light
differences. Protocol decoding, AO/lightmap sampling, border refresh and
save/reopen tests are included. See [gameplay-lighting.md](gameplay-lighting.md).
Regression checkpoint: **64/64 generation**, **99/99 local worlds**.
Rendered browser confirmation remains outstanding (automation connection refused).

## Creative-flight stability correction

`1be7c08` corrects zero-length large-oak limbs that produced NaN coordinates
and a misleading missing-region error away from the origin. The captured
failure did not require expanding the working window. See
[flight-generation-failure.md](flight-generation-failure.md) for the actual
source, stack, native observations, regression and browser-validation limits.
Latest suites: **60/60 generation**, **95/95 local worlds**.

## Growing stateful population research

`GrowingPopulation189` now uses chunk-addressable, atomic incremental generation
storage, durable readiness and pending admissions, and a bounded 4×4 execution
window. A dormant streaming adapter preserves player overlays and refreshes
locally changed columns. See [stateful-population.md](stateful-population.md)
for schema 4, rollback/retry, cache bounds and validation.

The experimental ID remains disabled. A worker-side Web Locks ownership guard
has been added for the proposed ID, but browser termination recovery and
protected playable integration are not yet verified. A two-session diagnostic demonstrates
that one adapter's cached/transmitted columns are not notified when a second
session commits changes. Durable CAS is correct, but live cross-session cache
coherency is not. Native registration/spawn and end-to-end browser validation
remain pending; no browser performance numbers are claimed.

## Verified stages

### Isolated non-structure population features

`generateLake189(world, random, x, y, z, kind, {canFreezeWater, topBlock})`
implements the 1.8.9 lake cavity, preflight rejection, liquid filling, dirt
restoration, lava boundary hardening and water freeze checks. `kind` is
`water` or `lava`; callers supply the biome's top state and the world-specific
freeze predicate. `canFreeze189` and `biomeBaseTemperature189` can provide
the latter with a biome lookup. Calls use the mutable `GenerationWorld189`
host and its existing fluid hooks; they do not advance scheduled fluid ticks.

**48/48 controlled lake calls** match the unmodified local server: both fluids,
three seeds, both signs and chunk crossings, low-elevation and wet-boundary
rejections, ice formation, and grass/mycelium surface restoration. Comparisons
cover return values, exact changed states and metadata, feature RNG methods,
bounds and final value (8,473 changed states). **8/8 natural-terrain calls**
also match, with 752 changed states across seed-7 plains, desert, taiga and
swamp inputs. Captures cover a bounded volume; more obstruction, mixed-fluid,
lighting, high/low terrain and world-RNG cases remain to be characterized.
The fixtures compare the feature RNG, but do not capture the separate world RNG.
The ellipsoid approach was independently adapted from Glowstone's MIT-licensed
`Lake.java` at commit `e9aeaa46330326f0d3917dce8f9bc4cdd1e434bd`;
`third-party/glowstone/LICENSE` retains its notice. Native observations, not
Glowstone's behavior, determine the checked 1.8.9 details.

`climate.js` supplies observed numeric base temperatures for the 61 registered
1.8.9 biomes, elevation-adjusted temperature, precipitation height, water
freezing and snow placement predicates. `freezeAndSnow189(world, chunkX,
chunkZ, baseTemperatureAt)` runs the offset 16×16 final pass; the temperature
callback supplies the base temperature of the biome at each position.
The final pass is separate from surface generation and consumes no RNG.

Climate comparisons cover 48 combinations of eight biomes, two coordinate
signs and three elevations, 14 candidate block states per combination, 64
support observations, and eight cases of enclosed water or block light.
**12/12 isolated pass comparisons** match 1,032 changed states over warm/cold
biomes and chunk boundaries. Those pass fixtures execute a separately authored
sequence of native precipitation, freeze, snow and block-write services; they
do not directly invoke the native provider's complete population routine.
Further native population-stage comparisons, natural-terrain snow passes, more
biome/height/obstruction combinations and cached-light timing are still needed
before claiming complete population parity. Neither these features nor the
decorator is connected to the incompatible immutable population planner.

Feature implementation checkpoint: `a572762`. The lake and climate probes in `tools/probe-{lake,natural-lakes,freeze,
freeze-pass,snow-support,climate-edges,biome-climate}.js` use the existing
`capture-decoration-fixture.mjs` runner with their respective mode names.
Fixtures contain numerical observations and source hashes, not game assets or
source.


`populationSeed189(worldSeed, chunkX, chunkZ)` computes the legacy population
seed using exact signed-long arithmetic and Java Random; it does not schedule
population. Five native provider calls with world seed 7 match the captured
initial and population seed values at positive and negative chunk coordinates.
An independent Java arithmetic fixture adds 56 cases spanning signed-long and
signed-int boundaries, with post-seed `nextInt` and `nextLong` outputs. Other
world seeds have not yet been captured from the native provider.


Mutable-world services in `generation-world.js` now match all **20/20 expanded
service sequences**, the original **12/12**, and eight additional per-write timing
traces (1,928 checkpoints, 400,636 light values). Logical section allocation, multi-column height
relighting order, the distance-17 light frontier, opacity/emission triggers,
initial-emitter cache state and direct versus neighbor-brightness
queries preserve the observed generation-time cached-light order.

All **140/140** existing complete biome-decoration invocations now match with
independently computed world services: **502,327 changed states**, **1,526,416
feature RNG calls**, both RNG streams' traces/final observations, and **11,008
candidate lighting values**. The original controlled-host comparisons remain intact.
The mutable-host fluid integration remains **180/180**. Diagnostic reports have
no remaining first differences. See [generation-world.md](generation-world.md)
for derivation, exact coverage and unverified cases. The host is not registered
or connected to the order-independent population planner. Corrected lighting
implementation: `c63ce74`. Current regressions:
`test:default-generation` **58/58**, `test:local-worlds` **85/85**.

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

1. Expand complete biome-decoration validation on natural terrain and unusual
   placement environments. All 59 Overworld biomes have controlled invocations.
2. Implement structures and population with explicit legacy order semantics.
3. Register the new generator only with an honest supported-stage contract,
   preserving old generator IDs and stored columns. Measure worker latency and
   memory once complete column generation is available.

## Isolated decoration features

### Biome orchestration checkpoint

`BiomeDecoration189` in `biome-decoration.js` sequences the existing ore, tree,
plant, sediment, spring and special-feature implementations against a mutable,
synchronous world. It is independent of the incompatible population planner.
All **118/118 complete controlled invocations**, two seeds over all **59
registered Overworld biomes**, match exact changed states, both RNG streams,
and numerical feature-boundary observations. The capture includes mutations,
negative coordinates, and writes outside the source chunk. **22/22 additional
invocations** cover nine unpopulated natural inputs (terrain seed 7), and thirteen
targeted planes with feature seed 3, including successful special features and
the tulip-noise branch. Total complete-call agreement is **140/140**, matching
**502,327 changed states** and **1,526,416 feature RNG calls** exactly. Both RNG
streams' final values and available tree/mushroom boundaries also match.

The host supplies current height/top-solid-or-liquid queries, placement/light
predicates, opacity/full-cube/material rules, and a separate world RNG. The test
adapter consumes numerical native lighting observations at mushroom attempts;
it does not claim to implement the runtime lighting engine. Native reads can
change cached lighting during a patch, so a single final light snapshot is not
a valid substitute. Fluid scheduling remains owned by `FluidUpdates189`, with
no automatic draining of deferred requests.

The orchestration preserves per-biome large-oak and giant-mushroom lifetimes.
Biome preparation raises large-oak foliage depth to five without resetting its
retained height. Integration fixtures also verify spruce obstruction/leaf
replacement and shrub replacement of non-full blocks, beyond earlier open-air
tree fixtures. Existing isolated fixtures are preserved. 1.8.9 Mesa does **not**
receive the later-version extra-gold feature.

MIT Glowstone's `BiomePopulator` and family-specific populators informed the
independent implementation. Its later-version counts/order were not used as an
oracle; complete calls into the local 1.8.9 server establish the version-specific
behavior. The existing MIT notice remains in `third-party/glowstone/LICENSE`.
The extended existing capture runner accepts mode `biomes`; its auxiliary
`probe-biome-decoration.js` records dictionary-compressed RNG traces and
numerical world-service observations. Delegating observers were checked against
the unwrapped capture: all 118 state changes and RNG traces remain identical.

The final capture harness reproduces all 118 original state/RNG outputs after
preventing incidental population while arenas are loaded. Natural inputs use
the native unpopulated provider, not the complete population routine. Additional
fixtures verify clay leaves sand unchanged and giant trees can establish their
other three support blocks on a slope after validating the anchor soil.

Regression checkpoint: `npm run test:default-generation` **31/31** and
`npm run test:local-worlds` **58/58**, alongside every original fixture. See
[biome-decoration.md](biome-decoration.md) for sequence, world-service contract,
provenance, reproduction, and capture limits. Complete population, structures,
runtime lighting/physics and wider terrain/material coverage remain separate.

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
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/vines.json.gz vines
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/mushrooms.json.gz mushrooms
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/springs.json.gz springs
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/fluid-updates.json.gz fluids
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/icepatch.json.gz icepatch
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/wells.json.gz wells
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/giant.json.gz giant
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/spikes.json.gz spikes
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/boulders.json.gz boulders
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

`generateVines189(world, random, x, y, z, canAttach)` matches 12 native
wall/open-air cases with three seeds and two heights. The support predicate is
supplied by the caller. Blocked starting points, competing support faces, and
all support materials remain unverified. Vine face conventions were informed
by MIT Glowstone `CocoaTree.java`; the upward growth behavior was independently
determined through native numerical fixtures.

`generateSmallMushroomPatch189(world, random, x, y, z, kind, canPlace)` matches
36 additional native cases on mycelium, podzol and grass, and 24 previous
unsuccessful observations. The caller supplies the light/support predicate;
the fixtures cover bright open-air conditions, not real dark-world lighting.
Its scatter loop uses the previously verified flower routine; MIT Glowstone
`MushroomDecorator.java` informed the light and substrate distinction.

`generateSpring189(world, random, x, y, z, kind, updates?)` now matches all 48
unchanged spring fixtures: both fluids, three seeds, two elevations, four
neighbor configurations, exact observed states and caller RNG. Seed 1 at Y=64
produces the reference's 74 water changes and 10 lava changes. The initial tick
uses the feature RNG; nested immediate scheduling uses the world RNG.

`fluids.js` contains independently authored `FluidUpdates189` primitives for
level updates, shortest downward-path selection, falling metadata, conversion
between flowing/still IDs, fluid contact, and synchronous neighbor updates.
MIT Glowstone `BlockLiquid.java` and `FlowingLiquidDecorator.java` informed
the material/placement rules, not a claim of version parity for Glowstone's
different pulse engine. Numerical native captures determine compatibility.
The host supplies synchronous get/set and its world RNG (`world.random` or an
explicit constructor argument). `runImmediate` scopes recursive generation-time
updates and restores the previous mode even on exceptions. Ordinary scheduling
requests are retained in `scheduled` or delivered to a supplied `schedule`
callback; they are never automatically advanced as runtime ticks. No gameplay
or population integration is enabled.

An additional **180/180 native immediate-update cases** now match exact states
(12,441 changed states), caller/world RNG call sequences and both final RNG
values, plus all 198 material movement flags. Fifteen scenarios per fluid cover
downward/horizontal flow, metadata, decay, source creation, obstacles, drainage,
flowers/signs, and water/lava contacts at levels 0/4/5. Three seeds, two heights,
negative coordinates and chunk boundaries are included. Original spring cases
remain **48/48**, with 1,440 changes matched. These are exact captured-volume
comparisons, not a claim of complete runtime simulation. Host callbacks are
required for arbitrary water-displaced block drops and nonfluid neighbor
physics; unsupported default displacement throws rather than approximates.
See [fluid-updates.md](fluid-updates.md) for the boundary, interface, provenance,
fixture limits, and actionable runtime backlog. Both regression commands pass:
`npm run test:default-generation` **31/31** and `npm run test:local-worlds`
**58/58**. Existing generator IDs and persisted worlds are unchanged.

`generateIcePatch189` matches 12 packed-ice patch fixtures on snow and grass,
at two elevations, three seeds and chunk boundaries, including post-call RNG.
Its cylinder geometry is adapted from MIT Glowstone `BlockPatch.java` and the
native numerical reference. Mixed ice/dirt substrates and obstructions remain
unverified.

`generateDesertWell189` matches 12 fixtures on sand and grass at two elevations,
including negative attempts and caller RNG. Its layout derives from MIT Glowstone
`GlowDesertWell.java`. Unsupported foundations and fluid interactions require
additional testing.

`generateGiantMushroom189` matches 24 isolated brown/red fixtures, including
cap/stem metadata, caller RNG, successful and failed soils and elevations, and
chunk boundaries. The caller supplies an opaque-block predicate when the world
contains non-air transparent blocks. Open-air geometry was adapted from MIT
Glowstone `BrownMushroomTree.java` and `RedMushroomTree.java`. Leaf canopies,
blocked volumes, arbitrary opacity and additional heights remain unverified.

`generateIceSpike189` matches 12 snow/grass fixtures at two elevations across
three seeds, including seed 88's rare tall spike. Contour geometry was adapted
from MIT Glowstone `IceSpike.java`, with RNG order, float behavior, and roots
verified by black-box fixtures. Deeper replaceable soil, edges near the world
height, and obstructions need additional reference coverage.

`generateMossyBoulder189` matches 12 fixtures for grass and sand over stone,
two heights, three seeds and chunk boundaries, including RNG state. Its three
overlapping ellipsoids derive from MIT Glowstone `StoneBoulder.java`, with
reference-corrected offsets. Mixed soils, non-solid obstructions, and replaceable
plants need further coverage.

Biome flower selection and feature sequencing are implemented in the separately
validated orchestrator above. Complete legacy population and structures remain
unimplemented. The population planner's semantics differ from legacy population;
the decorator is not connected to it.
