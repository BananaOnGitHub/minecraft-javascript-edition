# Generation-time fluid updates, Java 1.8.9

`client/js/local-world/generation/v1_8_9/fluids.js` implements independently
authored, synchronous fluid primitives. It is not attached to the playable
generator, population planner, or integrated server tick loop.
The independently callable biome orchestrator now reuses this engine for its
spring stage; see [biome-decoration.md](biome-decoration.md).

## Placement and update boundary

`generateSpring189(world, featureRandom, x, y, z, 'water' | 'lava', updates?)`
first checks stone above/below, an air/stone starting block, and three stone
plus one air horizontal neighbors. Invalid vertical/center conditions return
false; an accepted environment without the required neighbor counts returns
true without writing or consuming feature RNG.

A successful attempt writes the **flowing** source ID without neighbor
notification. Adding that block requests an ordinary scheduled tick. The
generator then enables immediate updates and directly ticks the source using
the **feature RNG**. New flowing blocks and reactivated still fluids request
updates synchronously, recursively, with the **world RNG**. The previous mode
is restored afterward, including when a host callback throws. Block writes
are not rolled back on exceptions.

This is not an iterative flood fill to a stable state: block replacement,
on-add mixing, notifications, and recursive scheduling remain interleaved.
The horizontal search order differs from the selected directions' application
order (north, south, west, east). Reordering these operations changes the
water/lava interaction fixtures. Conversion to a still ID can itself mix lava.

## Host contract

States are protocol integers `(blockId << 4) | metadata`. Reads and writes are
synchronous across chunk boundaries, including negative coordinates.

| API / constructor option | Responsibility |
| --- | --- |
| `world.get(x,y,z)` | Current state, including earlier feature/update writes |
| `world.set(x,y,z,state)` | Raw accepted state write; do not recursively repeat this engine's fluid hooks |
| Constructor `random` or `world.random` | Shared Java-compatible world RNG; never reseeded by the engine |
| `blocksMovement(state)` | Material movement flag, not collision-box occupancy; default matches all 198 native numeric block IDs |
| `isBarrier(state)` | Special fluid barriers, including signs, doors, ladders, reeds and portals |
| `isLoaded(x,y,z,radius)` | Immediate scheduling's loaded-area gate; radius is 8, default assumes the host prepared the area |
| `schedule(event)` | Ordinary scheduling request `{x,y,z,block,delay}`; default appends to `updates.scheduled` |
| `displace(x,y,z,state,kind,random)` | Host's block destruction/drop behavior and its world-RNG consumption |
| `neighborChanged(x,y,z,changedPosition,updates)` | Nonfluid neighbor physics; default does nothing |
| `onMix(event)` | Optional presentation notification after the engine consumes mixing sound RNG |

`tick(x,y,z,random?)` executes one flowing-fluid update; its RNG defaults to
the shared world RNG. `runImmediate(callback)` changes scheduling only within
that callback. `set`, `notify`, `request`, `flow`, and the level/path queries
are reusable separately. Keep one engine per host world/update context.

Ordinary scheduling requests are **not a deduplicated runtime tick queue**.
They retain the flowing block ID and delay (water 5, Overworld lava 30), but
the host must later implement queue deduplication, time/priority ordering,
loaded-area behavior, and stale-block checks. Existing queued requests are
not drained by an immediate generation call. `vaporizesWater` changes lava's
spread increment/delay for a future dimension adapter; Nether behavior is
outside this Overworld validation.

## Numerical validation

* All **48/48 original spring cases** match exact observed block positions,
  IDs, metadata, return value, and caller RNG: 1,440 changed states, including
  seed 1 at Y=64's 74 water changes and 10 lava changes. The fixture is unchanged.
* **180/180 additional immediate-update cases** match exact observed states
  (12,441 changes), caller/world RNG call sequences, and both final RNG values.
  The native palette also verifies all 198 material movement flags.
* Fifteen scenarios per fluid cover free sources, supported level-five flow,
  unsupported decay, nearby/distant drains, channels, obstacles, two neighboring
  sources, supply from above, fluid contact below, neighboring opposing-fluid
  levels 0/4/5, flowers, and signs. Each uses seeds 1/7/12345 and Y=64/72.
  Arenas use negative X and both signs of Z, with local X/Z=15 crossing chunks.
* Expanded observations cover X/Z offsets -16..16 and Y=55..79. Tests compare
  every state in that volume, including unexpected extra writes, not just
  expected nonair blocks. Larger/deeper worlds remain outside those fixtures.
* Contract regressions verify deferred scheduling, nested immediate scopes,
  exception restoration, and the host loaded-area gate.

Capture the additional fixture with the established runner:

```sh
node tools/capture-decoration-fixture.mjs /path/to/jjs /path/to/server.jar /path/to/accepted/eula.txt /tmp/fluid-updates.json.gz fluids
```

The probe reflects the protected native immediate-update flag and temporarily
substitutes a seeded Java Random delegate for the world's RNG, recording only
numeric states and RNG calls. It restores both fields; no game implementation
is decompiled, copied, or modified. Six reusable disposable arenas bound the
capture's memory. Server and probe hashes are recorded in the fixture.

## Provenance and limits

MIT Glowstone, commit `e9aeaa46330326f0d3917dce8f9bc4cdd1e434bd`, was inspected:
`BlockLiquid.java` and `FlowingLiquidDecorator.java` provide independent fluid
and spring-placement references. Its pulse engine and metadata differ, so it
was not used as a version-accuracy oracle. The existing license notice remains
in `third-party/glowstone/LICENSE`. Version-specific behavior here was authored
independently and corrected against black-box local-server observations.

The default displacement policy preserves RNG for one-item flower/mushroom
drops and lava's destruction effects; it does not create item entities or play
audio. Other water-displaced blocks **throw and require a host callback**;
their item-drop algorithms are not silently approximated. Nonfluid neighbor
physics, including support-dependent plants, also belongs to the host. Those
callbacks require additional behavioral coverage when integrated with a real
world. Full runtime fluid simulation, lighting, entity motion/damage, random
lava ignition, Nether behavior, world-height edges, and unloaded-world native
fixtures remain future work. No complete biome decorator or population
persistence changes are included.

Current regression commands, including biome orchestration:
`npm run test:default-generation` (33 tests) and `npm run test:local-worlds`
(60 tests), all passing. Mutable-host integration additionally replays the 180
fluid cases; broader host-lighting discrepancies are tracked in
[generation-world.md](generation-world.md).
