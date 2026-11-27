# Biome decoration, Java 1.8.9 Default Overworld

`BiomeDecoration189` in `client/js/local-world/generation/v1_8_9/biome-decoration.js`
orchestrates the existing feature generators. It does not register a playable
generator or use the optional population planner.

```js
const decorator = new BiomeDecoration189({observe: event => { /* diagnostics */ }});
const fluids = new FluidUpdates189(world, worldRandom, fluidHostOptions);
decorator.decorate(world, featureRandom, biomeId, chunkX * 16, chunkZ * 16, {fluids});
```

Keep the decorator alive for its generation context. Large-oak height/foliage
state and each decorator's initially selected giant-mushroom species survive
subsequent invocations. This is an order-sensitive legacy interface. Recreating
the object per chunk, parallelizing overlapping calls, or feeding it immutable
isolated feature batches changes the contract. Future population must decide
how its generator-instance lifetime and reload behavior are represented.

## Sequence and version boundaries

The implementation includes biome pre-decoration, standard ores, sediment
patches, trees and their preparation/post-generation hooks, giant mushrooms,
flowers, grass/ferns, bushes, lilies, mushrooms, reeds, pumpkins, cacti, water
and lava springs, and biome post-decoration. Forest grids/double plants,
plains noise and sunflowers, taiga boulders/ferns, savanna grass, ice spikes and
paths, hills emerald/infested-stone deposits, jungle melons/vine attempts, and
desert well attempts run at their observed boundaries. Failed attempts still
consume their native RNG draws.

Mutations do not uniformly inherit pre/post behavior: several use a base
decorator's counts with their own selectors, without invoking the base biome's
pre/post method. The birch mutations choose ordinary/tall birches by a boolean;
roofed-forest mutation takes the roofed forest's complete path. Noise-dependent
flower selection uses the existing simplex implementation and fixed seed 2345.
1.8.9 has no later-version Mesa extra-gold pass.

No additional unimplemented individual feature was needed by the observed
1.8.9 Overworld biome paths. Lakes, dungeons, structures, spawning, and the final
freeze/snow pass are separate population stages, outside this decorator.
Biome-wide decoration is distinct from complete chunk population.

`decorationCounts189(id)` returns effective default counts; they can differ from
the unused fields on a native mutated biome's own decorator. `selectFlower189`
exposes flower selection independently. The observer receives before/after
feature events with origins, variants, feature RNG state, and return values.

## Mutable world contract

| Member | Required behavior |
| --- | --- |
| `get(x,y,z)` / `set(x,y,z,state)` | Synchronous current states, including prior features and cross-chunk writes; out-of-height reads return air |
| `height(x,z)` | Native height-map query on the current world, not a cached base-terrain height |
| `topSolidOrLiquid(x,z)` | Native query used for sediment origins; distinguish it from height and collision queries (water does not stop its downward search) |
| `canPlace(state,x,y,z)` | Current support, light, sky and block-specific plant placement rules |
| `isOpaque(state)` | Opaque-cube predicate for giant mushrooms |
| `isFullCube(state)` | Full-block predicate for shrubs and spruce foliage; leaves are not interchangeable with air here |
| `canAttachVine(world,x,y,z)` | Version-specific support-face predicate |
| `random` | Separate Java-compatible world RNG; constructor argument to `FluidUpdates189` may supply it explicitly |

Predicates passed directly to feature routines should be bound functions or
pure functions of their arguments. The material movement palette used by
cactus/fluid placement remains separate from opacity/full-block predicates.
The host must provide version-correct lighting and block physics. A constant
"bright" predicate is insufficient under canopies and inside caves.

Reuse one `FluidUpdates189` for the call/context, with its host callbacks for
displacement and nonfluid neighbor physics. World writes must not independently
repeat that engine's fluid hooks. Immediate updates occur within spring calls;
the decorator does not drain or advance deferred runtime scheduling. See
[fluid-updates.md](fluid-updates.md) for the required callbacks and limits.

## Reference results

| Capture | Complete invocations | Exact changed states | Feature RNG calls |
| --- | ---: | ---: | ---: |
| All 59 Overworld biomes, feature seeds 1/7, grass plane | 118/118 | 422,564/422,564 | 1,238,720/1,238,720 |
| Thirteen targeted planes and nine natural inputs, feature seed 3 | 22/22 | 79,763/79,763 | 287,696/287,696 |

The tests compare method/bound sequences and final values for both RNG streams,
every net changed position/ID/metadata, observed tree origins/return values,
and mushroom feature/query boundaries. Unchanged air/stone does not inflate
these changed-state results. All original isolated feature fixtures, including
the 228 spring/fluid cases, remain active.

Natural input is obtained directly from the native Default provider's
unpopulated chunks, seed 7, at coordinates representing ocean, plains, desert,
hills, forest, taiga, swamp, jungle, and Mesa. Input sections are stored as
numerical RLE arrays. Negative coordinates and chunk crossings are included.
Hills and Mesa contain 394 and 16 observed fluid changes respectively.
Targeted planes exercise successful forest pre-decoration, the plains tulip
noise branch, sand/cacti, mycelium, snow/ice features, and birch mutations.

Lighting is a supplied world service, not a new implementation in this module.
The test host uses native numerical light observations at mushroom attempt
boundaries, independently of whether the attempt places a block. Native cached
lighting can change during a patch; final or feature-start snapshots alone are
not equivalent. Those observations provide environment inputs to the host's
placement predicate, not expected output placements.

Captures observe a four-by-four chunk window (relative X/Z -16..47), all 256
heights, including out-of-source-chunk changes. Results establish complete-call
agreement for these captured worlds and host services, not universal lighting,
runtime physics, arbitrary Customized settings, or fully populated chunk parity.
Broader terrain seeds, deep cross-boundary fluid paths, unusual transparent
materials, and arbitrary host block destruction remain validation work.

## Reproduction and provenance

```sh
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/biomes.json.gz biomes
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/biome-extra.json.gz biomes-extra
npm run test:default-generation
npm run test:local-worlds
```

The existing runner and probe are extended with an auxiliary biome probe,
dictionary-compressed RNG call records, delegating feature observers, and world
service observations. Newly loaded reference chunks are marked populated before
their neighbors load, preventing incidental full population; actual biome
decoration is invoked explicitly. Native provider output replaces the natural
arena input. No structures or complete population routine is invoked by the
capture. The final harness recapture reproduces all 118 original controlled
state/RNG outputs. Server, main probe, and auxiliary probe hashes are recorded.

Independent MIT Glowstone `BiomePopulator` and family-specific populators at
`e9aeaa46330326f0d3917dce8f9bc4cdd1e434bd` informed feature families and
placement behavior. Numerical local 1.8.9 observations establish the release's
actual counts, ordering, selector branches and lifetimes. Existing attribution
and `third-party/glowstone/LICENSE` are preserved. No proprietary implementation
was copied or decompiled.

Natural/overlap fixtures additionally corrected narrowly scoped, previously
uncovered feature behavior: spruce clearance and non-full foliage replacement,
shrub foliage over vines, giant-tree anchor-only soil validation on slopes,
clay's dirt/clay substrate filter, and cactus height draws on out-of-height air.
Existing isolated algorithms and their reference cases are otherwise reused.
