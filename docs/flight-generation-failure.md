# Creative-flight generation disconnect

Correction: `1be7c08`, following playable integration `0a73c8c`.

## Reproduction and diagnosis

Seed `-321252946616194827`, experimental Default, safe spawn
`(7.5,71,7.5)`, view distance 8. Preparing the initial view and streaming east
fails at the third view center (step 2). The recorded failure is:

- Population source chunk `(9,1)`.
- Active feature: `tree`, `big-oak`, origin `(167,84,39)`.
- Prepared chunk bounds: X `8..11`, Z `0..3`.
- Requested block coordinates: `(NaN,NaN,NaN)`.
- Feature RNG internal seed at tree entry: `217513032538619`; at failure:
  `20244862868653`. World RNG internal seed: `245121721159309`.
- Stack: `GenerationWorld189.getState` → `get` → `setBlockWithLeafBreak` →
  oak limb → `generateBigOakTree189` → `BigOakTree189.generate` → biome tree
  invocation → decoration → partial population → `populatePending`.

The limb interpolator divided all three zero deltas by zero when the branch's
endpoints coincided. Its NaN positions reached world access. JavaScript bitwise
chunk-coordinate conversion maps NaN to zero, so the strict host reported a
missing region once chunk `(0,0)` was outside the prepared halo. A larger window
would hide the invalid coordinates rather than correct them. No evidence from
this reproduction calls for a dynamic population window.

## Correction and reference

`generateBigOakLimb189` now returns before interpolation for a zero-length limb.
All other limb geometry and axis metadata are unchanged. There is no RNG draw
in this helper. The existing retained oak lifecycle, population ordering,
transaction boundaries, fixed halo, cached lighting, exclusive ownership and
player overlays are unchanged. No saved columns are regenerated or migrated.

`tools/probe-oak-limb.js` calls the local unmodified reference server's limb
method through runtime reflection. Six numerical cases cover zero-length,
vertical and horizontal limbs at positive and negative chunk coordinates.
Native zero-length calls place no blocks. No game source was read/decompiled.
The new fixture stores probe/server hashes and numeric observations only.

`tools/fixtures/flight-population-input.json.gz` captures the JavaScript
pre-population state of source `(9,1)`, including all sixteen columns' blocks,
light/allocation/height state, decorator state and both RNG seeds. This is an
integration regression input, **not a native population parity fixture**.
The regression verifies the actual big-oak origin and finite in-region reads
and writes. It fails with `invalid read NaN,NaN,NaN` when the guard is removed.
All existing fixtures remain unchanged.

## Validation and limits

- Full generation suite: **60/60** (previous 58 preserved).
- Full local-world suite: **95/95** (previous 93 preserved).
- Corrected reported-seed eastward Node streaming replay: 20 view centers,
  612 unique columns, no missing-region error.
- Seed 7 eastward Node replay: 12 view centers, 476 unique columns; 432 completed
  populations, peak resident population window 16 columns.
- Seed -7 westward post-fix Node replay: 12 view centers, 476 unique columns,
  432 populations, peak resident population window 16 columns.
- Earlier diagnostic sweeps also completed seed -7 and seed 1 around the origin
  and seed-7 jungle terrain near chunk `(-289,-188)` without the reported error.
  These earlier sweeps are diagnostic coverage, not post-fix browser acceptance.

Reproduce the disposable Node streaming replay with:

```sh
node tools/probe-experimental-exploration.mjs -321252946616194827 east 20
node tools/probe-experimental-exploration.mjs 7 east 12
node tools/probe-experimental-exploration.mjs -7 west 12
node --test tools/test-oak-limb.mjs
```

The tool uses fake IndexedDB and the actual terrain/population adapter. It is
explicitly **not real-browser gameplay validation**. Browser tools in this
session could not reach the workspace server: opening `http://localhost:3000`
reported `net::ERR_CONNECTION_REFUSED` although the source server was running;
a later attempt to bind the reported live tab returned `Tab not found`.
Sustained manual browser flight across seeds/biomes still needs confirmation.

A separate row-ordered seed-7 diagnostic sweep exposed
`Unimplemented fluid destruction 175` (double plants). That is a distinct host
callback coverage gap, not this NaN failure, and is not suppressed or changed by
this correction. Broader gameplay stability must not be inferred solely from
the successful routes above.
