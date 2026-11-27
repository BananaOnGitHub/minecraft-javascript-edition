# Large-oak generator instance lifecycle

The existing tree implementation and numerical fixture were supplied in the
Gemini/Claude handoff. The correction preserves that implementation and the
original fixture's block data under this repository's existing license. No
proprietary source code or assets were used for this correction. The behavioral
probe calls methods in the user's local unmodified server through its runtime
ABI and records numerical outputs only.

The original fixture's probe constructs one large-oak generator outside its
seed loop, then calls it with seeds 1, 2, and 7. The generator retains its chosen
height limit between calls. Its first invocation selects height 14; subsequent
calls retain 14 and do not consume a second height-selection random draw. The
JavaScript implementation previously selected a new height on every call,
shifting all foliage samples for seed 2. Seed 7 also chose a different height.

`new BigOakTree189().generate(world, random, x, y, z)` exposes this instance
lifecycle explicitly. Retained height reductions from obstructed trees are
stored on the same instance. The existing `generateBigOakTree189` function
remains a fresh-state convenience call. There is no module-wide tree instance,
so callers control lifetime rather than introducing hidden world/request order
dependencies. A future population system must explicitly choose instance
lifetime as part of its generation contract.

The original handoff fixture is unchanged: shared-instance seed 1 produces
480 modified blocks, seed 2 produces 510, and seed 7 produces 444. The additional
fixture checks shared and fresh instances separately, block states and metadata,
retained height, and the caller RNG after generation. In particular, a fresh
seed-7 instance chooses height 13 while the shared instance retains height 14.

Run `npm run test:default-generation` for these regressions. To independently
recapture the six lifecycle cases with a local Java 8 Nashorn runtime:

```sh
node tools/capture-big-oak-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/new-big-oak-fixture.json.gz
```

The runner creates a disposable world, copies an already accepted EULA, and
uses an ephemeral loopback port. It invokes `tools/probe-big-oak.js` and records
the SHA-256 of both the supplied server and the probe. It refuses to overwrite
an existing output file. The native generator is neither decompiled nor patched.
The diagnostic input is a flat stone/grass plane created in memory; the output
is relative block coordinates and numerical block states.
