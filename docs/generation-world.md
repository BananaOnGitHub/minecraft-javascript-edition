# Mutable generation world, Java 1.8.9

`GenerationWorld189` supplies independent synchronous block storage, mutable
heightmaps, native height/top-solid queries, light arrays and bounded light
updates, material predicates, plant support checks and a shared fluid updater.
The independent host now matches **all 20 expanded service cases** and **all
140 existing complete biome-decoration invocations**, including all captured raw
and neighbor-light observations. The controlled reference-lighting host remains
as a separate orchestrator regression; it is not used by the independent host.

## Interface

Construct with `{random, loadColumn, minChunkX, maxChunkX, minChunkZ, maxChunkZ}`.
`random` is the shared world JavaRandom, never the feature stream. The synchronous
loader returns a 65,536-entry Uint16Array in Y/Z/X order. Bounds describe the
readable region including halo. Missing-region reads/writes throw; reads outside
Y=0..255 return air. Loading is independent of IndexedDB or the population planner.

`get`/`set` serve feature access; `setRaw` performs the actual storage/lighting
update. `setAndNotify` explicitly requests neighbor physics after an accepted
write; ordinary generation writes do not automatically notify every neighbor.
`height`, `topSolidOrLiquid`, `canSeeSky`, `getSkyLight`, `getBlockLight`,
`getLight`, and `lightFromNeighbors` query current world state synchronously.

`isOpaque`, `isFullCube`, `isFullBlock`, and `blocksMovement` are distinct. In
particular native air reports full-cube true but full-block false. Spruce/shrub
helpers accept `isFullBlock` when available, preserving the old host fallback.
The block property table contains numerical observations for all 198 IDs,
including opacity, emission and neighbor-brightness flags. Metadata-dependent
placement behavior is handled by the host predicates, not collision boxes.

`canPlace` implements the observed soil rules for flowers, grass/ferns, bushes,
mushrooms, reeds, lilies and cactus. Mushroom light queries use independently
maintained cached light, never captured values. Basic vine attachment uses full-cube plus material
movement; neighbor handling retains supported face bits and above-vine support.
Fluid-driven plant support updates are separate from ordinary flag-2 writes.

Pass `{fluids: world.fluids}` to the decorator. `FluidUpdates189.set` calls
`setRaw` when supplied, preventing duplicate liquid on-add hooks. Adding liquids
through `world.set` uses that same updater. Deferred requests remain queued;
nothing advances runtime ticks. Supported displacement creates numeric drop
events and consumes world RNG, without spawning runtime entities. Unsupported
destruction types throw. Extended plant/vine neighbor behavior and displacement
types beyond the existing native flower/interaction cases need more coverage.

## Reuse and independent derivation

The existing client `world/world.js` was inspected, including height updates and
its remove/reseed lighting solver. `world/chunk.js` supplies the reused TypedArray
and nibble storage. The rendering solver batches changes, eagerly propagates
lighting and uses different opacity handling; its timing is not used as a parity
oracle. This host uses independently authored synchronous light checks, with
vertical attenuation and local removal/recalculation queues after writes.
No rendering, client registry initialization, or integrated-server tick loop is
modified. Glowstone's MIT `GlowChunk`/`ChunkSection` light storage was inspected;
it does not supply a verified 1.8.9 generation-timing solution.

Native probes observe public services and numeric properties only. They do not
copy or decompile game source. Existing source licenses remain unchanged.

## Corrected timing and behavioral derivation

The first divergence occurred during roof construction, before the previous
step-zero snapshot. Per-write numerical probes distinguish these paths:

* Logical section allocation is tracked separately from the reused physical
  TypedArrays. The first block in a new native section constructs the skylight
  map. Later writes in that section update the changed column and check its
  horizontal neighbors over the old/new height interval. Checks complete the
  west, east, north and south columns before the changed column; interleaving
  those columns by Y or checking the changed column first changes cached light.
* Skylight-map construction stores positive vertically attenuated values and
  retains cached values below its attenuation frontier. It is not a globally
  settled light solve. Light writes that allocate a section take the same map
  construction path. Explicit map construction/check calls are tested too.
* Local light checks run when opacity or emission changes. Metadata-only leaf
  writes and nonemitting plant writes do not unconditionally relight. Brown
  mushrooms emit level 1; red mushrooms do not. This explains why queries can
  see cached-light changes within one mushroom invocation.
* Light queues include Manhattan distance 17: an entry below distance 17 can
  enqueue a neighbor at distance 17. Applying the strict bound to the neighbor
  instead truncates observed canopy updates.
* Provider-created raw emitters start with zero cached block light; a later
  explicit light check seeds their emission. Initializing input lava to emission
  15 incorrectly brightens the natural swamp fixture before an update.
* Mushroom support checks read direct combined light, distinct from the public
  neighbor-brightness query. Both query forms are compared independently.
* Leaf-break metadata updates occur after storage replacement and before the
  outer height/light update. Existing feature helpers see already-marked leaves
  and do not repeat those writes.

These rules were independently derived and corrected using the local unmodified
server's numerical behavior. `probe-lighting-timing.js` extends the established
capture runner. It observes both coordinate signs after each roof block, plant
write, metadata write, explicit light check and skylight-map construction, and
records section presence. Two raw-lava sequences separate initial cached block
light from checked emission. Two sparse-canopy replays use numerical write input
authored by the existing independent JavaScript tree generator, sampling 79
positions after every write. The fixture records the input and probe hashes.
The replay exposed the column-check ordering and distance-bound discrepancies.
No source is copied/decompiled, no expected light is injected into the host, and no coordinate/biome/fixture-specific branches exist
in the implementation. Pending sky-gap work is not automatically drained as
runtime ticks; no full population scheduler has been added.

## Verified results and remaining limits

* Original service fixture: **12/12**, unchanged (8,000 light triples and 2,000
  height/top values).
* Expanded service fixture: **20/20**, unchanged, including the previously
  failing canopy/cave cases, transparent/opaque changes, support predicates and
  fluid interactions. No comparison criteria or snapshots were removed.
* New timing fixture: **8/8 traces**, **1,928 checkpoints**, **200,264 sampled
  positions / 400,636 light values**, plus **896 section-allocation observations**.
  Four roof/plant/metadata traces have 224 checkpoints; two initial-emitter traces
  have four; two 849-write canopy replays have 1,700. These include both coordinate
  signs and cross-chunk/section boundaries.
* Independent decorator: **118/118 + 22/22 evaluated and matched**. This covers
  all 59 Overworld biomes, 502,327 exact changed states and 1,526,416 generation
  feature-RNG calls. Both RNG call sequences and both final RNG observations
  match for every invocation. The biome fixtures consume zero world-stream calls
  during decoration; nonzero world-stream consumption is covered by the fluid
  integration cases. The additional observation draw per stream/case
  is excluded from generation-call counts.
* **5,504 captured mushroom candidate points** match both raw combined light
  and neighbor brightness: **11,008 light values**, with coordinates and exact
  post-draw boundaries checked. This includes occupied/invalid candidates whose
  predicates the generator short-circuits. The original taiga and swamp failures
  are resolved, including swamp placement; the additional Mega Taiga/Hills
  occupied-leaf observations also match.
* Shared fluid integration remains **180/180**. The original 48 spring cases,
  isolated generators and controlled-host 140-case decorator tests remain active.

Reports in `tools/fixtures/generation-world-{service,decoration}-report.json`
record evaluated counts, matched states/RNG calls/light queries and no remaining
first differences. The independent comparator evaluates every invocation,
records all failing invocations plus the first difference, and returns nonzero
on any mismatch.
Block-state, RNG and light agreement are reported separately; unchanged terrain
does not inflate the changed-state count.

There are no known discrepancies in these captured cases. This does not prove
universal runtime lighting or complete population parity. Broader terrain seeds,
other initial-emitter configurations, arbitrary metadata/transparent materials,
missing or unready neighbor chunks, weather/daylight subtraction, world-height
edges, extended
plant/drop/vine behavior and pending sky-gap execution outside these generation
sequences need further coverage. Logical allocation is initialized from the
provided block column; importing arbitrary externally lit chunks may require
preserving their actual section allocation and light state. No structure, lake,
dungeon, playable registration or persistence/planner integration is included.

```sh
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/services.json.gz world-services
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/timing.json.gz lighting-timing
node tools/compare-world-services.mjs /tmp/service-report.json
node tools/compare-generation-world.mjs /tmp/decoration-report.json
npm run test:default-generation
npm run test:local-worlds
```

Both comparison commands now succeed without injected lighting. Their failures
remain errors. The passing service, timing and complete independent-host
comparisons are permanent tests in `tools/test-generation-world.mjs`.
Implementation checkpoint: `c63ce74` (cached-light timing and reference coverage).
Final regression checkpoint: `test:default-generation` **35/35** and
`test:local-worlds` **62/62**.
