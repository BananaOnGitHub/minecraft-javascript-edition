# Stateful population research checkpoint

Implementation: `0938c67`; native readiness observations/model: `119bf4d`. This is a bounded research executor, not a playable world generator.
The proposed distinct ID is `java-1.8.9-default-experimental-stateful-v1`;
`EXPERIMENTAL_DEFAULT_189.enabled` is false. The reserved final identifier and
all existing saved-world identifiers remain unchanged.

## Execution and unsupported stages

`StatefulPopulation189` takes world/generator/stage identity, an exact BigInt
seed, a fixed prepared rectangle, the existing checkpoint store, an asynchronous
base-column loader and a synchronous `execute(context)` callback. It admits
calls in invocation order. Each callback gets a `GenerationWorld189`, separate
population-seeded feature RNG and continuing world RNG, and retained biome
decorator. Reads observe prior committed generation changes, including changes
outside the current source. Sources require a prepared four-by-four halo:
source offsets -1..2 in each axis. This is a conservative research requirement,
not a claim that native population waits for that entire halo.

`partialPopulationSequence189` composes structure boundary, lake gates/calls,
eight dungeon origins and dungeon hooks, existing biome decoration, animal
boundary and final freeze/snow. Biomes and climate use explicit lookups. Every
unsupported boundary records both internal RNG seeds. The default policy throws;
only explicit `missing: 'skip-experimental'` proceeds without a missing hook.
Skipped dungeon interiors and spawning consume variable RNG, so subsequent
partial decoration is expected to differ from native population. There is no
fixed-draw approximation or claim of complete populated terrain parity.

Structures receive a hook that can return the village-presence flag. Dungeons
receive each sampled origin and the feature RNG; animals receive the source
region and biome. Hooks are synchronous and must not perform external effects:
failed attempts can be retried. No dungeon, structure, block entity, loot or
animal implementation is introduced.

Four actual native provider invocations (seed 7, both signs, source X 400/401
and -400/-399) match the RNG method/bound prefix through the first dungeon
interior draw. The black-box probe replaces only the caller Random, records
runtime caller class names, and intentionally aborts at that boundary. At least
one invocation exercises both lake paths. This does not validate later stage
ordering or final populated blocks. Existing isolated feature fixtures remain
separate and unchanged. World-RNG observations and complete-call fixtures are
still required.

`PopulationReadiness189` separately models native chunk-load admission:
check the newly loaded source, west, north, then northwest; admit a source only
when its own, east, south and southeast terrain chunks exist. Six actual server
chunk-provider sequences over nine prepared chunks match every intermediate
population-origin list, including negative coordinates and a center-last order
that makes four sources ready together. The native provider uses an independently
authored dummy terrain delegate to observe scheduling without mixing feature
behavior into the test. Repeated preparation emits no duplicate admissions.
This model is not yet wired to worker terrain requests or the durable journal;
restart/eviction readiness must be represented before that connection is safe.

## Persistence and restart contract

Immutable base columns continue to use `world-chunks`. A separate, versioned
journal record uses the existing `world-population` store. No schema migration
or reinterpretation of planner records is needed. The journal contains:

* Explicit source completion/order and diagnostics.
* All resident generated block states, cached sky/block light nibble arrays,
  mutable heightmaps, logical section allocation and biome arrays.
* World RNG internal seed, retained big-oak height/foliage settings and each
  biome decorator's giant-mushroom species.
* Deferred fluid requests and numeric drop observations; neither is executed
  as runtime simulation.

Every operation reconstructs a private scratch host from the last durable
journal and prepared bases. `commitStatefulPopulation(record, revision)` uses
one IndexedDB compare-and-swap transaction for writes, instance/RNG state and
completion. Execution errors and failed commits publish none of these. Base
preparation may leave immutable terrain records, which is harmless. Same-session
calls serialize; separate sessions conflict atomically and must retry from the
winner's durable state. Completed sources return the journal without rerunning.
Player checkpoint revisions and player-edit overlays are not modified.

The research reopen contract resumes one logical generator session, including
its retained instance fields. It is **not** established as native server-restart
behavior: native biome generators may be recreated rather than serialized.
That distinction must be investigated before choosing a playable save contract.

## Validation and performance

The eight stateful tests cover adjacent negative/positive source calls, overlapping
writes, noncommutative ordering, duplicate prevention, reopening, retained lights,
height/allocation/RNG state, deferred updates, immutable terrain, unchanged player
checkpoints, feature exceptions, commit failure/retry and concurrent sessions.
These are infrastructure comparisons, not native population parity.

`node tools/benchmark-stateful-population.mjs` uses a disposable fake IndexedDB
arena and seed-7 carved native terrain near plains chunk (14,-22). One measured
partial source, including preparation of 16 columns and journal commit, took
361 ms in Node; the snapshot contained 3,158,272 typed-array bytes. Process RSS
was about 152 MiB (whole Node process, not worker-specific memory). These are
single-run diagnostic numbers, not browser-entry, frame-time or throughput
measurements. No major optimization was attempted.

## Playable-registration blockers and next work

1. Integrate the validated isolated admission model with terrain preparation,
   durable completion and pending work. The executor still requires explicit
   source admission; larger native sequences, unload/reload and edge cases need
   reference coverage.
2. Compare complete native population stage boundaries, including world RNG,
   lighting and height changes. Validate later stages independently of missing
   dungeon/spawning consumption.
3. Decide and validate restart lifecycle semantics for retained generators.
4. Replace bounded full-arena snapshots (maximum 64 columns) with an atomic
   growing-world journal/eviction contract that retains light-only halo changes.
   Rewriting the whole arena per source is unsuitable for continuous exploration.
5. Integrate committed generation revisions with worker streaming cache
   invalidation, spawn selection and player-edit overlays before registration.
6. Then perform browser creation/exploration/edit/save/reopen and multiplayer
   regressions, and measure worker memory, entry/streaming latency and frame time.

No experimental option is exposed in the creation screen, no browser world was
entered for this checkpoint, and no worker or renderer path is switched to this
executor. The existing incompatible `PopulationPlanner` remains unchanged.

Final checkpoint commands: `npm run test:default-generation` (51/51) and
`npm run test:local-worlds` (78/78). The existing 140 independent biome calls,
20 expanded world-service cases, 180 immediate-fluid cases, 56 lake calls and
12 isolated snow passes remain in those suites. No fixture criteria were weakened.
