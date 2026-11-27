# Optional deterministic feature population

The local-world storage layer supports an opt-in population planner for procedural
voxel generators. Existing generators do not enable it, and their saved chunks
and identifiers remain unchanged. The planner is exercised with original
diagnostic patterns rather than game-specific features.

A generator can supply a `population` descriptor with a stable stage `id`, an
integer `radius` (0–4 chunks), and a synchronous callback `populate(world, x, z)`.
The coordinates identify a source chunk. The callback can read and write blocks
within its declared square neighborhood through `world.get(x,y,z)` and
`world.set(x,y,z,state)`. `world.contains(x,y,z)` checks the generator's world
bounds. Generator boundaries must be chunk aligned. The callback must be a
deterministic function of immutable generator settings, source coordinates,
base terrain, and its own writes; it must not read player state or depend on
the order in which the browser explores chunks. Its RNG, when needed, must be
seeded independently for each source.

The planner evaluates every source that can reach a requested destination
before exposing that destination to gameplay. Each source reads stored raw
columns and sees its own buffered writes, but other source batches are not
visible during planning. In case of overlap, the source with the later
lexicographic `(chunkX, chunkZ)` coordinate wins. This is a deliberately defined
order-independent composition contract, not a simulation of another game's
population order.

IndexedDB schema 3 adds a `world-population` store. The key contains the world,
generator version, population stage, and source coordinate. Each record stores
all writes from that source across its destination chunks. The record itself
serves as the completion marker, even when there are no writes. If planning
throws, nothing is published. A concurrent writer uses the first committed
batch. Base columns are still immutable. The existing player-edit overlay is
applied after all generated writes, preserving both placements and removals.

The in-memory raw-column cache is separate from the completed-column cache.
Persisted batches ensure an evicted or reopened column can be reconstructed
without rerunning its completed sources. The generator version must change
when its population contract or callback behavior changes; a previously saved
generator identifier must never be silently assigned a new stage.

Run `npm run test:population` for the original diagnostic patterns, concurrent
requests, persistence and reopening, failure/retry, bounded access, and database
migration tests. These are infrastructure tests, not native world-generation
parity results. No existing world type is switched to the new planner.
