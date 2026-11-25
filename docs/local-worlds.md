# MinecraftJS local worlds

This work adds a browser-hosted building sandbox to the MinecraftJS 1.8.9 client. The initial original world, **Terrace Yard**, is a 256 × 256 block site made of seeded terraces and level paths. It starts with six building materials. Each named world stores its seed, block changes, and last saved player position.

## Start a world

Open **Singleplayer → Create World**, enter a name and an optional seed, and choose **Create World**. Use the existing movement, jump, and block interaction controls. **Esc → Save and Quit** waits for the worker’s final checkpoint before returning to the menu. Reopen the same named world under **Singleplayer**. Names are unique within the browser origin. With a blank seed, the world name is the seed.

Provision assets from your own installation using the upstream build. For example, run the following in the client checkout. A static HTTP server on a consistent local origin keeps IndexedDB saves available between visits.

    npm ci
    npm run build -- --static --audio=copy --out=dist/local-worlds
    python3 -m http.server 8000 --bind 127.0.0.1 --directory dist/local-worlds

The runtime game server runs in a dedicated worker. A static file server only serves the browser application. The packed HTML build also embeds the worker. Storage availability for locally opened HTML depends on browser handling of local origins.

## Integration

| Client subsystem | Integration |
| --- | --- |
| Connection and protocol | A MessageChannel exposes the existing socket shape. The worker passes protocol 47 play frames without TCP framing, authentication, or compression. The existing decoder dispatches packets to Game. Larger clientbound packets transfer buffer ownership. |
| World state and interactions | The client keeps its World, Chunk, meshing, and predictive physics. The worker generates columns, checks reported positions for collisions against its own terrain, and sends the final state of an edited block. |
| Inventory and entities | The worker supplies a hotbar of full-cube building materials, validates slots, and uses the existing player state. Other entity behavior and wider inventory simulation are outside this sandbox build. |
| Menus | The title screen opens a world picker and creation form. Connecting, loading, in-world and disconnect screens follow the normal client lifecycle. |
| Assets, graphics, and audio | The patch uses upstream resource provisioning and the existing graphics and audio paths. The packed and static builds bundle the worker alongside the existing mesh worker. |
| Settings and storage | Graphics, controls, and audio use existing settings. The worker caps its chunk radius at four. Origin-scoped IndexedDB stores snapshots using optimistic revisions. Each accepted edit is committed before confirmation. |

The protocol adapter lives in local-world/protocol.js. The terrain model and checkpoint store can be exercised independently. Session start/stop and ordered commands reuse the browser-session foundation. Worker generation and streaming metrics are available at game.conn.ws.metrics, and Connection exposes packet and byte counters. Measure rendering through the upstream profiler while separately recording worker peak tick time, chunk generation time, and resident chunks.

## Server assessment

| Candidate | Findings | Decision |
| --- | --- | --- |
| [Flying Squid](https://github.com/PrismarineJS/flying-squid) | MIT. Its maintained server documents support for the 1.8 family, movement, digging, placement, generation and Anvil loading. The package entry point and dependencies use Node-oriented protocol, storage and CLI modules. | Useful reference for a pluggable server interface. Browser-worker startup and exact 1.8.9 behavior remain unverified. |
| [Space Squid](https://github.com/zardoy/space-squid) and [Minecraft Web Client](https://github.com/zardoy/minecraft-web-client/blob/next/README.MD) | Space Squid is an MIT TypeScript fork used for the web client’s offline mode. Its server dependencies still include filesystem, compression, and CLI packages. That web client provides a browser integration and Anvil storage. Its documentation describes limited survival features. | The existing browser port is evidence for feasibility. Integrating it here would require verifying the protocol 47 plugin and dependency paths. |
| [PrismarineJS modules](https://github.com/PrismarineJS) | Versioned registries, NBT, chunk and world modules are independent candidates for later interoperability work. | The initial sandbox reuses MinecraftJS’s codec and avoids an additional registry or runtime dependency. A future use of any module should pin and review its specific version and license. |

No external server package was benchmarked in this environment. The server projects’ entity AI, inventory, redstone, and memory behavior were not verified. The sandbox code adds no runtime dependencies and uses the repository’s GPL-3.0 license. Keep the upstream license, contributor history, and attribution when applying the patch. Provision upstream assets only in local builds.

## Base and validation

Upstream and the development fork both resolved to commit
[e6d2c47da32e67b8a30082e469430f3a12ddabfc](https://github.com/Reb0rnEnder/MinecraftJS/commit/e6d2c47da32e67b8a30082e469430f3a12ddabfc)
on branch 1.8.9. The local project folder contained the vanilla reference installation, server and worlds. Use the fork’s existing 1.8.9 history as the patch base. The patch can be applied with git am. For future upstream updates, fetch Reb0rnEnder/MinecraftJS as the upstream remote and merge upstream/1.8.9 on a development branch before running the regression suite.

### Verified results

The source inputs matched the upstream Git blob hashes.

- Upstream and modified packed builds and the modified static build completed using cached npm dependencies and the local 1.8.9 asset installation.
- Existing menu layout, login transport, and connection cancellation regression files passed before and after the patch.
- The integration test drove the real Connection decoder from a native Node worker over MessageChannel. It verified login ordering, a spawn column decoded by the upstream Chunk class, accepted movement, collision correction, chunk streaming and unload, authoritative material selection, placing and breaking blocks, saving position, reopening block edits, and duplicate names.
- The integration test uses a temporary file checkpoint fixture. Real Chromium IndexedDB transactions, pointer lock, framebuffer output, and connecting to the vanilla reference server still need live verification.
- In a two-pass Node spot check, generation and encoding for 256 columns took about 85 ms on the first pass and 69 ms on the second. The sample emitted 12,652,288 bytes in total. The timings exclude renderer, MessageChannel, storage, and browser overhead.

    node --test tools/test-local-world.mjs tools/test-connection-cancellation.mjs tools/test-login-transport.mjs tools/test-menu-layout-regressions.mjs

The shell sandbox denied direct GitHub DNS resolution and loopback TCP connections/binds. The browser blocked the packed file URL. A runnable checkout and a browser-accessible dev origin with narrowly scoped local serving would allow a visual singleplayer check and multiplayer regression session. Use the same origin for save/reopen and verify both graphics backends on the intended hardware.

## Scope and next verification

| Feature | Current verification |
| --- | --- |
| Named world creation and selection | Menu routing, worker startup and duplicate names covered by tests. Browser storage and menu interaction pending. |
| Seeded terrain | Deterministic terraces and reversible edits covered by tests. |
| Spawn, movement, and collision | Protocol spawn, accepted movement and correction covered by tests. Keyboard movement and jump pending in a headed browser. |
| Chunk streaming and unloading | Verified through the existing codec and Chunk loader. |
| Block placement and breaking | Authoritative edits and persisted states verified with a checkpoint fixture. Pointer-lock interaction pending. |
| Save and reopen | Node worker fixture covers block edits and player position. Browser IndexedDB transactions and concurrent-tab behavior pending. |
| Asset provisioning and rendering | Packed and static builds verified. WebGL 2 and WebGPU output pending. |
| Multiplayer | Login, connection cancellation and menu regressions pass. A live join to the reference server remains pending. |

Open a named world, walk and jump, cross a chunk boundary, build and remove a block, save and return, then reopen and verify the changes. Run the existing multiplayer path against the local reference server afterward.

Current storage keeps a full snapshot of edits per world. A larger editable area needs chunk-level writes and recovery tests before increasing the map size. Add IndexedDB conflict and crash-recovery tests in a browser before extending persistence. The sandbox uses fixed lighting and a building palette. Legacy-world import and export, time and weather, crafting and survival, mobs, fluids, redstone, and additional dimensions are outside this integration.
