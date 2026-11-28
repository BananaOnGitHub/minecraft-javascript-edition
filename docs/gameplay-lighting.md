# Gameplay lighting after native generation

The experimental stateful generator now has a separate settled gameplay-light
view. `GenerationWorld189` and its persisted population-light snapshots remain
unchanged. Those snapshots intentionally reproduce native generation-time cached
light and must not be globally settled before subsequent features read them.

## Reproduced cause

For seed `-321252946616194827`, the player's reported position `(123,75,1)` is
open sky (native skylight 15). Nearby western overhangs reproduce the failure:

| Position | Initial native vertical map | After native chunk maintenance | Gameplay view |
| --- | --- | --- | --- |
| 102,85,9 | 0 | 14 | 14 |
| 99,84,16 | 0 | 5 | 5 |
| 99,86,16 | 0 | 6 | 6 |

Four natural neighborhoods around chunks `(7,0)`, `(8,0)`, `(6,0)` and `(6,1)`
use the exact reported seed. All 36 input column comparisons (including repeated
halo columns), totaling 2,359,296 block states, match independently generated
carved terrain. Of the 31,744 sampled natural positions, **338** initially have
incorrectly dark skylight; native chunk light population and gap maintenance
correct them. All sampled natural light values then agree with explicit native
light checks and the new gameplay solver.

The previous streaming adapter sent the persisted population caches directly.
For terrain without a population snapshot, Protocol 47's older generic fallback
constructed vertical-only sky light. Neither path completed lateral skylight
propagation. The client trusts incoming chunk light, so these zeros survived into
AO and the lightmap. The nibble packing, block/sky ordering and lightmap axes were
correct; changing gamma, AO or face shading would hide the missing server update.

## Reported cave check at (-67,60,66)

A second capture uses the same seed around chunks `(-5,4)`, `(-4,4)` and
`(-5,3)`, sampling Y=50..76. The three prepared-terrain cases match
**20,736/20,736 skylight and block-light samples each**. Independent carved
states match every native input column, including the negative-coordinate
chunk boundaries. This is a comparison on equivalent unpopulated terrain, not
a dump of the user's live IndexedDB or full vanilla population.

| Position | Native sky / block | Independent sky / block |
| --- | --- | --- |
| -67,60,66 (reported position) | 0 / 0 | 0 / 0 |
| -67,61,74 | 1 / 0 | 1 / 0 |
| -67,61,75 | 2 / 0 | 2 / 0 |

The protocol/client test also follows the region through `buildSlice` and
`SliceWorld`, rather than sampling only the client World directly. Air/AO
samples around the reported camera position remain sky=0, block=0; no added
light is reproduced in the meshing path. The weak skylight farther south is
present in the native reference too.

The existing lightmap keeps a nonzero ambient floor even at light levels 0/0:
its RGB entry is 14/14/14 at gamma=0 and 25/25/25 at the default gamma=0.5.
Material albedo and face/AO shading can therefore make pale sandstone appear
brighter than nearby stone without a nonzero light value. The screenshot is
consistent with this behavior. No production lighting or renderer adjustment
was made for this report; the user's exact rendered save has not been inspected.

Reproduce the numerical comparison with
`node tools/compare-gameplay-light.mjs --cave`; capture mode `cave-light` uses
the same disposable reference infrastructure. Results are recorded separately
in `tools/fixtures/cave-light-report.json`, preserving the original overhang
fixture and report. Regression checkpoint: **66/66 generation**, **101/101
local worlds**.

## Implementation and lifecycle

`gameplay-light.js::gameplayLight189` derives two packed nibble arrays from the
current block states of a complete 3×3 neighborhood. It initializes direct sky
and emission, then propagates attenuated six-neighbor light using descending
level queues. Transparent materials, water attenuation, and opaque emitters use
the existing numerically observed 1.8.9 block properties. The one-chunk halo is
sufficient because non-direct light loses at least one level per step; outside
sources cannot reach the central chunk with a positive contribution.

`GrowingTerrain189` reads that halo without admitting population. It keeps at
most 64 light-input columns and one derived view per prepared-column cache entry
(maximum 384). It does not load the entire world. Population commits invalidate
affected views and their neighbors. Player overlays are applied before solving;
removing an emitter or changing a roof recomputes both channels from states, so
stale cached light cannot remain. Light-only neighbor updates are queued even
when that neighbor's blocks did not change.

The integrated server awaits pending view updates before sending refreshed
chunks, including ticks with no new chunk requests and successful player edits.
Derived arrays are disposable presentation state, not new checkpoint records.
Reopening recomputes them from durable generated states plus saved edits.
Generation snapshots, logical section allocation, deferred fluids, retained
feature instances, world/feature RNG, CAS revisions and atomic commits keep their
previous contracts. No saved-world or generator identifier migration occurs.

This computes the **settled target**, rather than reproducing the number of
native ticks before every gap/queued relight finishes. It does not advance
scheduled fluids, block ticks or population. Future runtime simulation must
keep its lighting lifecycle separate from the population parity host.

## Numerical validation and provenance

`probe-gameplay-light.js` uses the existing disposable local-server runner. It
captures initial cached values, native light-population/gap-maintenance results,
and explicit native sky/block checks. The fixture also covers broad opaque roofs
at positive and negative chunk coordinates, a leaf canopy, water, glowstone,
glass, lava, emitter removal, roof opening and a supported torch. Post-edit
**block states** include native neighbor callbacks (such as leaf decay metadata);
the lighting comparison consumes those states, never captured light values.

The independent solver matches **79,360/79,360 sky samples and
79,360/79,360 block-light samples** across seven base cases and three edited
states. These include opaque positions as well as air. Controlled synthetic
maintenance alone initially leaves raw emitter caches unseeded; explicit native
checks establish the final target. This is distinguished in the stored stages.
The original generation-time, controlled-decorator and independent-host fixtures
are preserved.

Protocol/client tests decode the actual chunk packet, compare every sampled
state and both light channels, and exercise the existing AO sampler and lightmap.
Storage tests preserve a deliberately different population cache (6) while the
same open gameplay position is 15, verify cross-border emitter removal, retain
neighboring edits on reopen, and confirm presentation updates do not alter any
population metadata or persisted snapshot.

The solver is independently authored mathematical propagation using the existing
client's light/storage interfaces and numerical observations. Glowstone's MIT
light storage was already reviewed for `GenerationWorld189`; no external code or
proprietary implementation source is copied. Reference fixtures contain numerical
states and light values only, with server/probe hashes.

Reproduce:

```sh
node tools/capture-decoration-fixture.mjs "$JJS" "$SERVER_JAR" "$ACCEPTED_EULA" /tmp/gameplay-light.json.gz gameplay-light
node tools/compare-gameplay-light.mjs
node --test tools/test-gameplay-light.mjs
npm run test:default-generation
npm run test:local-worlds
```

Warm Node measurements for the pure 3×3 solve were approximately 20–40 ms per
central view (first call about 50 ms); these are not browser frame measurements.
The worker records pass count, total and peak solve time in `lightingMetrics`.
More overlapping solves occur after population commits; batch optimization can
follow measured browser profiling. No renderer or multiplayer code is changed.

Final regression checkpoint: **64/64 default-generation**, **99/99 local-worlds**.
`npm run build -- --no-assets` passes. The full asset-embedding build stops at the
preexisting missing `node_modules/ffmpeg-static/ffmpeg` executable; this change
does not modify build dependencies or generated game assets.

A browser visual confirmation is still required. The available automation browser
could not connect to localhost (connection refused); the numerical protocol,
client sampling and persistence checks are not presented as a rendered test.
