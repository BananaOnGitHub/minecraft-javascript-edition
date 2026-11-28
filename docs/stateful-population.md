# Stateful population research checkpoint

## Growing storage checkpoint (`797d96b`)

The new `GrowingPopulation189` replaces the full-arena storage contract for
growing research worlds; the bounded executor below remains available for its
original fixtures. Playable registration is still disabled.

IndexedDB schema 4 adds `world-generation-columns` and
`world-generation-meta`; older stores, generator IDs and checkpoints are retained.
Column keys include world, generator, stage, X and Z. Metadata holds the exact
seed, revision/sequence, world RNG state, retained decorator fields, a durable
pending-source queue and the latest operation diagnostics. It does not contain
a growing history of generated columns or completed coordinates.

Each column carries terrain-admission readiness, population status, completion
sequence, generated section/light arrays, heightmap/allocation/biome arrays,
and its deferred fluid/drop observations. A source executes in a private 4×4
window restored from current persisted generation state over immutable terrain.
Only columns whose generated state, cached light, height, allocation or deferred
effects changed are written (plus the source completion record). Whole columns
are stored when affected; this is not a sparse per-block encoding. All affected
columns and metadata commit in one compare-and-swap transaction across the two
new stores. A transaction abort rolls back both stores. Unchanged old columns
are neither loaded globally nor rewritten.

Explicit terrain requests use the validated source/west/north/northwest
admission order and 2×2 readiness. Pending admissions commit before execution;
`executing` is transient session state and `completed` is durable column state.
On interruption, pending work is retried from durable state. Silent read-halo
preparation never admits additional sources. Per-session calls serialize and
conflicting sessions retry from the latest global metadata revision.

The new host keeps 16 logical columns resident per population operation and
retains no global prepared/completed set. `GrowingTerrain189` adds a 64-column
immutable base LRU and 384-column generated LRU. Player edits remain the existing
separate overlay. Reopening continues the existing logical-session contract for
RNG and decorator instances; native restart parity remains unverified.

Seven new passing tests cover exploration past 64 columns, unchanged old-column
revisions, reopen/duplicate prevention, queued failure recovery, light-only
neighbor changes, deferred updates, adapter edit preservation, all six native
readiness sequences through durable admission, multi-store rollback and
concurrent sessions. Tests use fake IndexedDB; they are not browser benchmarks.

### Streaming integration and confirmed blocker

The adapter invalidates/refreshes previously cached columns affected by its own
commits. The server has an optional packet-refresh hook for those columns,
including ticks without a newly requested chunk. No existing generator uses the
adapter; no new world-creation option is registered.

Cross-session cache coherency is **not yet safe**. Reproduce with:

```sh
node tools/probe-growing-session-coherence.mjs
```

Two adapters share one database. Session A caches column (0,0); session B prepares
a 2×2 neighborhood and populates it. Durable state becomes 64 at (0,70,0), but A
still reads 0 and receives no invalidation notification. The diagnostic returns
nonzero; this mismatch is not accepted by a passing golden test. CAS protects
durable state but cannot alone refresh another worker's transmitted chunks.
A revision-feed/polling or enforced single-session contract must close this gap
before playable registration.

Browser spawn, entry, exploration, packet-refresh behavior, save/reopen and
frame/worker/storage measurements have **not** been validated for the new path.
A native generator adapter, safe spawn selection and complete registration are
still absent. Browser creation is deliberately disabled while this confirmed
streaming-coherency failure remains. No structures, dungeon/spawning algorithms
or runtime fluid engine are added.

## Earlier bounded research contract

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

## Exclusive ownership preparation

A worker-side `acquireWorldOwnership` helper requests an exclusive, per-world
Web Lock with `ifAvailable`; a second holder receives a user-facing already-open
error. Missing Web Locks fail closed. Different IDs use different lock names.
The experimental-ID path in `loadLocalWorld` acquires this lock before
creating a new experimental world or constructing a gameplay session/terrain
adapter for an existing world (both ID-based and display-name-based lookups),
rereads the checkpoint under the lock, and releases it after close/save or
construction failure. Existing world types are unaffected.

Unit tests use a deterministic fake lock manager and cover contention, separate
worlds, release/reopen, missing API, new-world pre-create failure leaving the
store clean, and refusal at the gameplay entry point (both ID and name lookup).
Real browser verification in Chromium and Firefox confirmed Web Locks refusal
across tabs, concurrent flat-world execution, and lock recovery after abrupt
tab termination. The low-level cross-session diagnostic (`probe-growing-session-coherence.mjs`)
remains unchanged and still intentionally exits 1.

## Experimental playable integration

`EXPERIMENTAL_DEFAULT_189` (`java-1.8.9-default-experimental-stateful-v1`) is
enabled as the `defaultExperimental` ("Default 1.8.9 (Exp.)") world type in
`world-settings.js`, `world-metadata.js`, `terrain.js`, `i18n.js`, and
`local-worlds.js`. The final `java-1.8.9-default-v1` ID remains unregistered
and rejected.

- `experimental-default.js` provides `ExperimentalDefaultTerrain189` around
  `DefaultTerrain189.carvedColumn`, a bounded 256-chunk biome LRU (`biomeAt`),
  `partialPopulationSequence189({ biomeAt, missing: 'skip-experimental' })`, and
  `findSafeExperimentalSpawn` (scanning near origin for dry ground, preparing a
  3x3 chunk neighborhood, and verifying safe non-fluid, non-colliding headroom
  against populated terrain).
- `GrowingPopulation189.read` and `protocol.js::chunkPacket` transmit persisted
  generated `skyLight`, `blockLight`, and `lastSection` (covering light-only
  halo sections), while `GrowingTerrain189.column` uses a worker-safe
  `WorkerRelightWorld` backed by `BLOCK_PROPERTIES_189` to relight edited
  columns across reloads. `collides()` in `terrain.js` allows passable 1.8.9
  decoration blocks so player movement does not snag on plants or thin snow.
- Known limitations remain explicit in UI and metadata: partial population
  only (no major structures, dungeon interiors/loot, population-time animal
  spawning, or full runtime fluid simulation; no automatic migration of old
  worlds).

### Verified results (latest integration checkpoint)

- `npm run test:default-generation`: **58/58**
- `npm run test:local-worlds`: **92/92** (includes `tools/test-experimental-default.mjs`
  covering light/edit packet payloads, UI registration, ownership enforcement on
  create/ID/name lookups, and seed-7 protocol 47 exploration past 64 chunks,
  edits, save, reopen, and non-duplication)
- Upstream regressions (`test-item-use-legacy`, `test-tls13-client`,
  `test-account-blocklist-proxy`, `test-login-state-regressions`,
  `test-login-transport`, `test-proxy-deployment`): **18/18**
- Real Chromium UI/F3 verification (`http://localhost:3000`): created/entered
  seed `7` (`Default 1.8.9 (Exp.)`, Creative) with limitation notice rendered,
  safe spawn at `(-11, 63, -9)` in `Birch Forest`, `MultiplayerChunkCache: 289, 289`,
  `171 fps` on WebGL 2.0, `/seed` -> `Seed 7`, clean `Save and Quit` & reopen,
  cross-tab lock refusal (`This world is already open in another tab or worker.`),
  coexisting `Flat` world (`0 33 0`), and `page.close()` lock recovery. (Interactive
  pointer-lock movement and `page.evaluate` were restricted by the webview sandbox.)
- Real Firefox WebDriver BiDi headless verification (`http://localhost:3000`):
  created/entered seed `7` in `3206 ms` (`WebGL 2`, initial `storageUsage`
  `~6.0 MB`), explored `244` unique chunks (`539` neighbor chunk refreshes,
  `193` populations in `2383 ms`, `cachedBaseBytes` `~39.0 MB`, bounded
  `cachedBiomes: 256`, `storageUsage` `~22.0 MB`), placed and dug blocks (`4`
  total edits across spawn and destination), saved and reopened in `1110 ms` at
  exact saved position with `0` duplicate populations and verified block states
  (`1 << 4` above `0`), confirmed Tab-2 Web Locks refusal, `Flat` coexistence,
  and abrupt tab-close recovery.
