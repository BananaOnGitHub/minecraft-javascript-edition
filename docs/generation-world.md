# Mutable generation world: implementation and open timing discrepancy

`GenerationWorld189` supplies independent synchronous block storage, mutable
heightmaps, native height/top-solid queries, light arrays and bounded light
updates, material predicates, plant support checks and a shared fluid updater.
It is **not ready to replace the controlled decorator host for every biome**.
Multi-block canopy/cave lighting still disagrees with the numerical reference.

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
mushrooms, reeds, lilies and cactus. Mushroom light queries use computed light,
never captured values. Basic vine attachment uses full-cube plus material
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

## Results and exact limits

* The original **12/12 service sequences** pass: open terrain, glass, leaves,
  water, torch and glowstone placement/removal at both positive and negative
  chunk boundaries. This compares 8,000 light triples and 2,000 height/top values.
* A preserved **20-case expanded capture** adds multi-leaf canopies, caves,
  mushroom writes, plant-support changes and water/lava mixing. Full comparison
  currently passes **16/20**; both canopy and both cave cases fail. They are
  diagnostic failures, not suppressed/marked-passing regressions.
* The shared fluid updater, host displacement and no-duplicate-hook contract
  pass all **180 existing immediate-fluid fixtures**, including final feature
  and world RNG values and exact changed states. The original 48 spring and
  other generation/decorator fixtures remain unchanged.
* Independent-host decorator comparison stops on the first divergence, after
  **10 exact leading invocations in each dataset**. This is not a 140-case match
  rate; later invocations are not evaluated after that first failure.

The first controlled-host difference is taiga biome 5, feature seed 1, RNG call
7299, position `(6412,69,6415)`: computed light **14**, native **13**. That call
still matches final blocks and RNG. The additional dataset first fails swamp
biome 6, seed 3, call 8497, `(6422,65,6406)`: computed **13**, native **10**;
the mismatch also prevents a reference mushroom placement. Reports are stored
in `tools/fixtures/generation-world-{service,decoration}-report.json`.

The immediate next task is matching multi-column relighting/section-allocation
and pending sky-gap timing. A globally settled flood fill is insufficient:
native cached light changes within a mushroom invocation. No fixture-specific
lighting exceptions or injection are used in the independent comparisons.
Initialization around natural emitters, arbitrary transparent states, full
plant/support predicates, fluid destruction/drop types, vine updates and loaded
boundary cases need broader reference coverage. Do not register this host as a
playable generator or connect it to immutable isolated population batches.

```sh
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/services.json.gz world-services
node tools/compare-world-services.mjs /tmp/service-report.json
node tools/compare-generation-world.mjs /tmp/decoration-report.json
npm run test:default-generation
npm run test:local-worlds
```

Both comparison commands intentionally return nonzero while discrepancies
remain. Original controlled-host biome tests remain isolated and unchanged in
purpose; new passing tests cover the verified service sequences and fluid reuse.
Final regression checkpoint: `test:default-generation` **33/33** and
`test:local-worlds` **60/60**. These passing suites do not imply that the separate
expanded-service and independent-decoration diagnostic comparisons pass.
