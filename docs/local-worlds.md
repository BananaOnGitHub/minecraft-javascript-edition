# Local world creation and compatibility

Run the project with npm start and open http://localhost:3000. New source changes are served directly. Saves belong to that exact origin. Use the same hostname and port to reopen existing browser worlds.

## Implemented flow

The creation screen has a name field, a save-directory preview, a mode selector, and a second page for seed and world options. Create and Cancel are accessible on both pages. Names, seeds, settings, and explicit command-permission overrides survive page switches. Duplicate display names receive separate UUIDs and portable directory names. A concurrent transaction resolves directory collisions.

Modes cycle through Survival, Hardcore, and Creative. Creative enables commands by default until the user explicitly changes that setting. Hardcore forces commands and starter chest off and selects hard difficulty. The server applies initial creative/survival capability flags and restricts creative slot packets to Creative mode. Full survival simulation and permanent-death handling remain pending and are identified in the UI.

Only /seed and /gamemode survival|creative are implemented. Command permission is enforced by the worker. Structure and starter-chest settings are stored, and their controls show that generation is pending. The current terrain selectors describe the project's original generators. The creation layout and terrain algorithms have their own design.

## Seed interpretation

New version-three worlds use these rules:

- Empty input or parsed numerical zero selects a random signed 64-bit seed.
- A valid nonzero signed 64-bit decimal value is used directly.
- Remaining input uses Java's signed 32-bit UTF-16 String.hashCode result.
- Decimal parsing preserves Java whitespace behavior. Input containing spaces is hashed when parsing fails.
- Resolved seeds are saved as decimal strings and handled with BigInt. Reopening never resolves them again.

local-world/java-random.js extends the existing client LCG with validated bounds, long, boolean, byte, and Gaussian methods. tools/JavaRandomFixture.java creates reference output using public JDK APIs. The committed fixture covers positive, negative, and extreme long seeds and mixed method-call sequences. It also covers text hashes, surrogate pairs, isolated surrogates, Unicode decimal digits, overflow and whitespace.

All 294 exact scalar comparisons against the JDK fixture passed. All 35 Gaussian samples passed a 1e-14 absolute tolerance. JavaScript Math log/sqrt can differ from Java StrictMath in the final bits.

The public behavior used for these routines is documented by Oracle. [Random](https://docs.oracle.com/javase/8/docs/api/java/util/Random.html), [String](https://docs.oracle.com/javase/8/docs/api/java/lang/String.html#hashCode--), [Long](https://docs.oracle.com/javase/8/docs/api/java/lang/Long.html#parseLong-java.lang.String-)

## Configurable flat worlds

Selecting Flat exposes a layer editor with thickness, block ID, block metadata and biome ID. Layers are ordered from the bottom up in storage and displayed from the top down in the editor. The editor supports adding, removing and selecting layers, four project presets, Done and Cancel. It validates the 256-block height limit.

The server fills exact block states from the saved layers, streams the resulting columns, and uses the resulting height for spawn. The original presets are Garden foundation, Stone workshop, Sandstone foundation and Shallow reservoir. Partial-block collision shapes, fluid updates and population for arbitrary layer choices need further work.

Old version-two flat worlds retain their original generator. The new configurable flat generator has its own identifier.

## Save format and recovery

| Record | Behavior |
| --- | --- |
| Version 1 | Original bounded Terrace Yard, its old seed hash, and original edit encoding. |
| Version 2 | Original noise landscape and seed interpretation, with its original settings and sparse edits. |
| Version 3 | UUID, display name, directory name, resolved decimal seed, creation options, generator ID/version/configuration, spawn, position, hotbar and sparse edits. |

IndexedDB schema version 2 adds a separate world-chunks object store while retaining the checkpoints store. Each generated base column commits before it is sent to the client. Columns are keyed by world UUID and coordinates. First-write transactions keep one immutable base column when two tabs generate the same coordinate concurrently. Generator identifiers are checked before loading a save or its stored chunks. An unavailable generator version produces an error and leaves the data available.

Player modifications remain separate from base columns. Checkpoint revisions prevent stale writes. The worker waits for active streaming before its final save and close. The regression suite covers database upgrades, duplicate names, write conflicts, generator mismatches and stored-column reuse.

The column cache retains at most 384 base columns, about 48.1 MiB of block and biome arrays. The original landscape generator also retains a bounded 96-column working cache, potentially sharing some arrays with the persistence cache. game.conn.ws.metrics includes cached base bytes and chunk/tick timings. Browser frame-time impact while exploring new terrain still requires profiling.

## Reference comparisons

Run the comparison tool against an existing local world and its resolved seed:

    node tools/compare-world-generation.mjs WORLD_DIRECTORY NONZERO_SEED CHUNK_X CHUNK_Z REPORT_JSON

The tool reads Anvil region data without loading game application classes. It compares biome IDs, block IDs, metadata, full block states, calculated top-non-air heights, the bottom-five-layer bedrock mask, and ore/vegetation positions. Population flags identify the reference stage. Density samples are absent from region data. Structure comparisons need dedicated fixtures.

For the checked-in comparison report, the locally provisioned vanilla 1.8.9 server generated isolated temporary worlds for seeds 7 and -7. Each world was saved, its spawn moved to the origin, and the server restarted. Six populated chunks per seed were sampled at (0,0), (-1,0), (0,-1), (-1,-1), (1,0), and (0,1). The report records the server JAR SHA-256.

| Measurement | Match rate |
| --- | --- |
| Biome IDs | 0% |
| Calculated top-non-air heights | 0.0651% |
| Full block states | 86.3305% |
| Block IDs | 88.9319% |
| Metadata | 96.9270% |
| Bottom-five-layer bedrock mask | 60.3776% |
| Ore locations and states, measured over either column's ore cells | 0.1410% |
| Vegetation locations and states, measured over either column's vegetation cells | 0% |

These results establish a discrepancy baseline for the original landscape generator. Shared air and stone contribute heavily to whole-column agreement. Base-terrain parity has not been established independently of population. Native biome layering, density noise, surface rules, bedrock randomness, caves, ores, decoration and structures remain incomplete. The existing generic landscape must retain its original generator identifier.

The Anvil reader is tested with synthetic region data, including negative coordinates, metadata, population flags, missing chunks and truncated files. The measured reference results are in tools/fixtures/world-generation-comparison.json.

## Dependencies and provenance

The integrated server adds no production dependency. fake-indexeddb is a development dependency for repeatable storage-upgrade and transaction tests.

The public Flying Squid package and Prismarine world/Anvil modules were inspected. Their MIT packages expose protocol, simulation and storage facilities. They do not establish accurate terrain parity for this implementation. The implementation reuses the project's codec, typed chunks, Java LCG, widgets and worker transport. [Flying Squid package](https://github.com/PrismarineJS/flying-squid/blob/master/package.json), [Prismarine World](https://github.com/PrismarineJS/prismarine-world/blob/master/package.json), [Anvil provider](https://github.com/PrismarineJS/prismarine-provider-anvil/blob/master/package.json)

The changes remain on local-worlds-test with the existing fork history and upstream attribution. Local game assets and reference world data remain outside commits. Only numeric comparison results and independently authored test code are committed.

## Validation and backlog

The selected validation run passed 80 tests. Run npm run test:local-worlds for the 21 local-world and compatibility tests. It covers seed interpretation and RNG output, creation navigation and mode defaults, layers and metadata, legacy worlds, worker streaming, command permissions and persistence. Existing login, cancellation, client, name-tag and tab-list regressions are also run.

The browser check used the normal npm source server. It created a Creative world named Compatibility check with seed -7, changed the top layer to brick, entered the world, checked /seed, saved, and reopened the same world. Its saved entry and reopened terrain retained the configuration.

Remaining work is explicit:

1. Independently validate base and populated terrain stages with broader fixtures. Accurate native terrain parity remains outstanding.
2. Provide the requested native world-type behavior and complete configuration support. The current selectors retain the original project presets.
3. Complete structure and starter-chest generation before removing their pending indicators.
4. Complete survival inventory, drops, damage, crafting, hunger and hardcore death semantics.
5. Profile generation I/O, cache retention and frame times during sustained browser exploration.
6. Add browser crash-recovery, quota-exhaustion and cross-tab tests beyond the in-memory IndexedDB regression tests.
