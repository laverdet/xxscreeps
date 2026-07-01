# xxscreeps

## 0.1.0

### Minor Changes

- 4178109: Reorder `createConstructionSite` checks; return `NOT_OWNER` on foreign rooms and `INVALID_ARGS` on bad spawn names
- 019eb5f: Generate deposits in highway-room sectors with a per-sector schedule and decay-driven re-evaluation.
- b021640: Add `StructureInvaderCore` defender spawning via `createCreep` and a shared spawn-completion helper.
- 23de927: Add `StructureInvaderCore` NPC actions, deploy/collapse expiry, action log, and invulnerable rangedMassAttack skip.
- 782525c: Reject reaction labs passed as their own reagent inputs.
- d0850fd: Place power banks in highway rooms on a per-room respawn timer.
- 123a1c5: Add nuker mod with launch, flight, and impact
- 5696d86: Add `RoomObject.effects`; `StructureInvaderCore` reports `EFFECT_INVULNERABILITY` while deploying.

### Patch Changes

- b951066: Allow signing in with an email address instead of only a username for form auth and HTTP Basic auth.
- 9a19f92: Render each room-socket update at the tick its blob was loaded for.
- 02d4f74: Support compare-and-swap (`if`) conditions on blob `set` in the local and redis keyval providers.
- 1340900: Add `manage bot` verbs (add/update/remove, first-spawn for JS/wasm bots) and register the `manage` subcommand.
- ac31320: Drop the backend CLI sandbox and REPL, replacing eval with host-realm execution.
- beaaecd: Remove CommonJS `require`/`__filename`/`__dirname` shims from the eval console.
- dab3531: Reorder construction creep build and repair validation precedence.
- 18d7412: Reject `createConstructionSite` over an existing buildable structure unless either side is road or rampart.
- 45e1f87: Send notifications for controller level-up, pre-downgrade warning, and downgrade.
- a7b346b: Reorder controller action validation precedence.
- d8f2cc5: Reject indestructible structures from `Creep.dismantle` with `ERR_INVALID_TARGET` before range.
- 6873b3c: Fix several timing issues (dead keeper rooms, ticksToLive == 0, etc)
- 0ec8c7b: Fix profile page: leaderboard/find returns ok without a season, and surface user gcl.
- c887938: Game.cpu.halt() in unsafe sandbox
- c62365e: Fix `Game.map.getRoomStatus` returning `closed` for every room.
- 935d6cf: Return `undefined` from `Game.map.getRoomStatus` for a non-string argument instead of throwing.
- 3dbb1fc: Align Creep.harvest validation precedence with vanilla
- 6f0f435: Preserve the subclass prototype when constructing a RoomObject from an id string.
- 16a5aa9: Throw `Could not find an object` when saving an intent for a stale object reference
- 178e409: Render invader core level, deploy time, and invulnerability effect to the client.
- 7852d4c: Fix isolated VM memory leak on code reset
- 5be5d87: allow game object subclasses to construct by id
- 8eda2a0: Emit lab reaction and reverse-reaction action logs to clients.
- d34460f: Reorder link transferEnergy validation precedence
- c0234b3: Fix local single-host worker ports closing immediately after connect.
- e5d6090: Fix local `zUnionStore` to apply WEIGHTS to members present in only one input set.
- 15c7e95: Fix `Room.lookForAtArea` and `Room.lookAtArea` cell shape when `asArray` is `false`.
- 2813a81: Fix Fn.lookAhead leaking an unhandled rejection when a source iterator throws.
- 06d8cbf: faster pathfinder
- 28d5ba0: Read `main.loop` each tick so a bot that reassigns `module.exports.loop` is honored.
- 47fc54e: Add user badge, password, and branch verbs to the manage script.
- c544687: Add minerals0 (type and density) to /api/game/map-stats response.
- 701f30d: Record terminal transfers in `Game.market.incomingTransactions` and `outgoingTransactions`.
- db0d77e: Treat a memory-limit disposal mid-deserialize as a disposed tick, not an error.
- 6fdd96b: Per-group notification delivery, plain transports array, fix local zadd GT/LT and zrangeWithScores ranging.
- ce72273: Fix in-flight nukes crashing the room processor with an invalid scheduler wake time.
- d7bcad6: Nuker launch/impact timing fixes; reorder safe-mode check in withdraw.
- bfbd54d: Move power creep account validation into shared result-code checks.
- 02d4f74: Add power creep account layer: GPL-gated create/upgrade/rename/delete, `Game.powerCreeps`, client GPL display.
- 22c212b: Add power bank structures with decay, hit-back, and ruin looting.
- 8e6a71b: Add power spawns that process power into Global Power Level.
- 514342c: Fix engine hang on SIGINT during the idle gap between ticks
- 6fbfbf5: Fix processor crash when a controller downgrades on the same tick as a queued object removal.
- f1e737e: Restore `rangedMassAttack` 3-tile radius and own/unowned target filter.
- 3c5d62f: Render absolute `cooldownTime` so client cooldown effects show; fix deposit cooldown off by one.
- 062d213: Expose `require.cache` on the player runtime so module entries can be deleted.
- 5cd5760: Floor road wear-out at `Game.time` so creep stomps can't push `#nextDecayTime` into the past.
- 7e6f48b: Fix `RoomPosition` construction for wasm bot bindings that build positions via `__packedPos`.
- 1b22ba2: Match vanilla: Room.survivalInfo returns undefined instead of null.
- 5724c76: Drop game/runtime.ts stubs that shadowed real Ruin, Deposit, StructureFactory, and StructureObserver registrations.
- a1fcfb7: Load shard tick processors in the main service so registered callbacks actually fire.
- 7a97cd4: Add registerShardTickProcessor; deliver Game.notify queues
- 32c9fdb: Memory accuracy improvements
- a0a9beb: Defer spawn ownership checks until after argument validation.
- 422086e: Report a creep spawned this tick as spawning the same tick.
- 3e2afba: Send attack notifications for owned creeps and structures
- bee4717: Set the sending terminal's cooldown after `send` so it can't send every tick.
- b4587b0: Align `checkTransfer` precedence with vanilla: source-empty → target-full → amount-aware NOT_ENOUGH → amount-aware FULL
- 75cbfb7: Hoist checkUnboostCreep target ownership above the active-structure gate.
- 792c4bd: Stub `user/decorations/inventory`, `user/tutorial-done`, and `user/money-history` to silence client 404s.
- aa50979: Add the `user/overview` endpoint so the client overview page renders room previews.
- 35bffd1: Add `User.remove` and an operator script for listing, creating, and removing users.
- e7a3430: Add a `version` backend hook so mods can amend the `serverData` bag advertised at `/api/version`. Register a handler to contribute fields the client needs at connect time, e.g. `hooks.register('version', serverData => { serverData.myFeature = 1; })`, instead of patching the response via koa middleware.
- f37a886: Hoist withdraw safe-mode validation before target and capacity checks.
- 5d37e1b: Reorder `withdraw` validation so invalid args, safe mode, target store compatibility, and full creep capacity take precedence over missing target resources.

## 0.0.9

### Patch Changes

- 59fb634: Hoist factory recipe and level-mismatch above RCL gate
- 494f239: Reorder checkCreateFlag for cap-full and name-exists precedence
- 4981251: Implement Game.notify queueing layer
- 15f3be6: Add Deposit mod
- 3f011d0: Allow construction sites on tiles occupied by a ruin.
- 73d1a26: Fixes for undocumented `new Creep(id)` behavior
- 0596bdb: Fix `xxscreeps import` so the default `.screepsrc.yaml` includes mods declared in the project's own `package.json`.
- b2d2a78: Validate observer roomName before RCL gate
- 5b303f8: Fix construction sites in unseen rooms from client
- 9b2d70e: Reorder `checkPickup` to gate `ERR_FULL` before range
- 15f3be6: Add 'deposit' mod
- 6e3f037: Split null-target from wrong-type in `checkSignController`
- 2ef453a: Gate `upgradeBlocked` before range in `checkUpgradeController`

## 0.0.8

### Patch Changes

- cea4bd4: Fix `sandbox: unsafe`
- cdc915e: Add Creep.withdraw enemy-rampart guard; fix moveTo noPathFinding return code
- 47bb60e: Redirect `Creep.transfer` to `upgradeController` for energy targeting a controller, and reject `Creep.pull` against a spawning creep.
- eabf619: Reject `Creep.pull(self)` with `ERR_INVALID_TARGET`.
- 7517ba7: Return `'out of borders'` from `GameMap.getRoomStatus()` for closed rooms
- c946661: Make `RoomPosition.__packedPos` writable to match vanilla.
- 7cc29fe: Add portal mod with same-shard and cross-shard destinations
- afba4b3: Fix spawn placement
- c894ea4: Emit missing `Room.getEventLog()` events with vanilla-shaped payloads.
- 00adca6: Fix `Game.map.getWorldSize()` to return the inclusive room-coordinate span
- e8255b4: Reclaim body energy on Spawn.recycleCreep

## 0.0.7

### Patch Changes

- dbf3d6f: A bunch of changes
- Updated dependencies [df06ba1]
  - @xxscreeps/pathfinder@0.0.2
