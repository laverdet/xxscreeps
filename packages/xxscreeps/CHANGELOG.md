# xxscreeps

## 0.1.0

### Minor Changes

- 4178109: Reorder `createConstructionSite` checks; return `NOT_OWNER` on foreign rooms and `INVALID_ARGS` on bad spawn names
- 019eb5f: Generate deposits in highway-room sectors with a per-sector schedule and decay-driven re-evaluation.
- b021640: Add `StructureInvaderCore` defender spawning via `createCreep` and a shared spawn-completion helper.
- 23de927: Add `StructureInvaderCore` NPC actions, deploy/collapse expiry, action log, and invulnerable rangedMassAttack skip.
- 272aa2a: Add `zRank` to the keyval providers and honor `rev` in local range reads.
- 782525c: Reject reaction labs passed as their own reagent inputs.
- bb5dcf2: Rank players on monthly leaderboards for control points and power processed.
- 0bf9351: Add `Game.market.createOrder`
- d0850fd: Place power banks in highway rooms on a per-room respawn timer.
- 123a1c5: Add nuker mod with launch, flight, and impact
- 5696d86: Add `RoomObject.effects`; `StructureInvaderCore` reports `EFFECT_INVULNERABILITY` while deploying.

### Patch Changes

- d2268ac: Exclude other users' structures from the controller activeness ranking.
- b951066: Allow signing in with an email address instead of only a username for form auth and HTTP Basic auth.
- 65f88fb: Derive the default processor and runner `concurrency` from `os.availableParallelism()` instead of `os.cpus().length`, so a process confined by CPU affinity no longer oversubscribes itself with cores it can't run on.
- 9a19f92: Render each room-socket update at the tick its blob was loaded for.
- 36d52b4: Add a badge `symbols` hook, so a mod may grant svg symbols beyond the numbered shapes.
- 02d4f74: Support compare-and-swap (`if`) conditions on blob `set` in the local and redis keyval providers.
- 1340900: Add `manage bot` verbs (add/update/remove, first-spawn for JS/wasm bots) and register the `manage` subcommand.
- ac31320: Drop the backend CLI sandbox and REPL, replacing eval with host-realm execution.
- beaaecd: Remove CommonJS `require`/`__filename`/`__dirname` shims from the eval console.
- dab3531: Reorder construction creep build and repair validation precedence.
- 18d7412: Reject `createConstructionSite` over an existing buildable structure unless either side is road or rampart.
- 01a3a07: Release the room from a player's controlled rooms when their controller downgrades to neutral.
- 45e1f87: Send notifications for controller level-up, pre-downgrade warning, and downgrade.
- b4fa216: Add `isRoomControlled` / `isRoomReserved` to the controller model for single-room queries.
- a7b346b: Reorder controller action validation precedence.
- 8ccf1a4: Decorations reach the client: backend routes serve the catalog, the inventory and what is placed, pack assets are served immutable, and the room socket and world map pick up placement changes as they happen.
- 4aa60b9: Add the `decorations` mod's catalog: yaml-authored packs shipping real asset files, checked at load against everything the client's renderer will dereference, with generated inventory previews.
- 8f49545: Decorations gain their account state: per-user grants and typed placement of what the catalog offers — in a room, on a creep, or worn as a badge — handed out with `manage decoration` when `grantAll` is off.
- d8f2cc5: Reject indestructible structures from `Creep.dismantle` with `ERR_INVALID_TARGET` before range.
- e6b7c88: Move the email address into a backend mod, normalize its case, and reject duplicates.
- 6d0ffb7: Add `xxscreeps export`, writing the shard's world as a payload JSON file.
- 6873b3c: Fix several timing issues (dead keeper rooms, ticksToLive == 0, etc)
- 0ec8c7b: Fix profile page: leaderboard/find returns ok without a season, and surface user gcl.
- c887938: Game.cpu.halt() in unsafe sandbox
- 78534e6: Clear the pending foreign-segment request when `RawMemory.setActiveForeignSegment(null)` is called.
- 891cb9e: Generated rooms wall off borders facing ungenerated rooms; generating the neighbor reopens them.
- bf4ceda: Drop the `node:assert/strict` import from `game/map.ts`, which the runtime bundler cannot resolve inside the isolated-vm sandbox.
- d891076: fallback for Steam login on Safari
- c62365e: Fix `Game.map.getRoomStatus` returning `closed` for every room.
- 935d6cf: Return `undefined` from `Game.map.getRoomStatus` for a non-string argument instead of throwing.
- 3dbb1fc: Align Creep.harvest validation precedence with vanilla
- 7b97d8e: Match generated highway terrain to the live world: lane borders, mass and clutter shape, connectivity.
- 3d46065: createConstructionSite returns ERR_NOT_OWNER in rooms reserved by another player
- 6f0f435: Preserve the subclass prototype when constructing a RoomObject from an id string.
- b3063b4: Fix the `ignoreDestructibleStructures` pathing option, whose obstacle checker marked exactly the structures it was meant to path through, and every road and container along with them.
- 16a5aa9: Throw `Could not find an object` when saving an intent for a stale object reference
- cf64879: Reset the room controller to neutral when an invader core collapse timer expires.
- 178e409: Render invader core level, deploy time, and invulnerability effect to the client.
- 4bf2dba: Split the invader mod into classic raids and modern strongholds.
- 5d8145f: Fix invader raids doing no damage: `checkPath` measured spawn reachability from the invader instead of the spawn so raiders suicided on arrival, the `dismantle` which clears a path to a victim was never issued, and `shootAtWill` fired on structures including the spawn a raid is meant to leave standing.
- c5fd152: Register the `xxscreeps:mods/schema` virtual module in the isolated sandbox runtime bundle.
- 7852d4c: Fix isolated VM memory leak on code reset
- 5be5d87: allow game object subclasses to construct by id
- 8eda2a0: Emit lab reaction and reverse-reaction action logs to clients.
- d34460f: Reorder link transferEnergy validation precedence
- 8b26fd7: Fix local keyval reviver dropping plain objects and blob save unlinking never-flushed deletions.
- c0234b3: Fix local single-host worker ports closing immediately after connect.
- e5d6090: Fix local `zUnionStore` to apply WEIGHTS to members present in only one input set.
- 15c7e95: Fix `Room.lookForAtArea` and `Room.lookAtArea` cell shape when `asArray` is `false`.
- 2813a81: Fix Fn.lookAhead leaking an unhandled rejection when a source iterator throws.
- 06d8cbf: faster pathfinder
- 28d5ba0: Read `main.loop` each tick so a bot that reassigns `module.exports.loop` is honored.
- fe0ea3d: `manage game pause-tick` takes a step count and reports each tick stepped.
- 47fc54e: Add user badge, password, and branch verbs to the manage script.
- c544687: Add minerals0 (type and density) to /api/game/map-stats response.
- 6caf643: Add a `mapStats` backend hook so mods decorate `/api/game/map-stats` themselves.
- 701f30d: Record terminal transfers in `Game.market.incomingTransactions` and `outgoingTransactions`.
- 1874909: Accept shardless memory watch channels; return official error strings from memory editor routes.
- db0d77e: Treat a memory-limit disposal mid-deserialize as a disposed tick, not an error.
- 61a804b: Add `/api/user/memory-segment` endpoints; active segments pick up out-of-band writes.
- 213e215: Name the failing specifier in the `SuppressedError` thrown by `config/mods.ts`, so an unresolvable mod (or provider) is reported by name instead of a bare `Module Not Found`.
- 6fdd96b: Per-group notification delivery, plain transports array, fix local zadd GT/LT and zrangeWithScores ranging.
- ce72273: Fix in-flight nukes crashing the room processor with an invalid scheduler wake time.
- d7bcad6: Nuker launch/impact timing fixes; reorder safe-mode check in withdraw.
- 3a6ac63: Moved payload import/export onto per-mod codecs registered through the terrain slot.
- bfbd54d: Move power creep account validation into shared result-code checks.
- 02d4f74: Add power creep account layer: GPL-gated create/upgrade/rename/delete, `Game.powerCreeps`, client GPL display.
- 8f5c041: Spawn power creeps into rooms with the shared creep carry verbs, aging, renew, and death.
- 7958a94: powercreep: lose movement ties and die at nuke impact
- 1d4db69: PowerCreep.enableRoom and usePower with per-power cooldowns; PWR_GENERATE_OPS is the first working power.
- 22c212b: Add power bank structures with decay, hit-back, and ruin looting.
- 45fb21d: Fix the power creep roster listing throwing for creeps with a learned power.
- 8e6a71b: Add power spawns that process power into Global Power Level.
- bff10c8: Implement private messaging: send/list/index/mark-read/unread-count endpoints, live `newMessage` and read-receipt socket channels, and a `User.remove` hook to clean up a deleted user's messages.
- 514342c: Fix engine hang on SIGINT during the idle gap between ticks
- 6fbfbf5: Fix processor crash when a controller downgrades on the same tick as a queued object removal.
- 6ae6254: Publish a failed tick's captured console to the player instead of dropping it in `PlayerInstance#run`.
- 1a9a4da: Fix a backend socket crash
- f78f5e7: Unified random placement on a feistel permutation; placement fails only when no position qualifies.
- f1e737e: Restore `rangedMassAttack` 3-tile radius and own/unowned target filter.
- 3c5d62f: Render absolute `cooldownTime` so client cooldown effects show; fix deposit cooldown off by one.
- 062d213: Expose `require.cache` on the player runtime so module entries can be deleted.
- 5cd5760: Floor road wear-out at `Game.time` so creep stomps can't push `#nextDecayTime` into the past.
- 8a7e9fd: Flattened the room-generator hook context to Terrain and RoomPosition.
- 28982b3: Fixed the room terrain connectivity check flooding from a transposed start cell, which rejected valid layouts.
- 8533d8e: Place sources, controller, mineral, keeper lairs via mod terrain hooks; owner-less structures always active.
- 7e6f48b: Fix `RoomPosition` construction for wasm bot bindings that build positions via `__packedPos`.
- 77ff655: Replay the room-socket update that was suppressed by the first-spawn race-condition workaround once its skip window closes.
- f01f0a2: Track per-user room stats on the room blob via `ProcessorContext.incrementRoomStat`.
- 1b22ba2: Match vanilla: Room.survivalInfo returns undefined instead of null.
- 3bae39c: Add an offline `generate-room` command that procedurally generates a room's terrain.
- 5724c76: Drop game/runtime.ts stubs that shadowed real Ruin, Deposit, StructureFactory, and StructureObserver registrations.
- 556ac69: Import constants from `xxscreeps:mods/constants` in `game/runtime.ts` so mod-provided constants are exported to the sandbox again
- 642f344: Decode the runtime source map with `@jridgewell/trace-mapping` instead of `source-map@0.6`
- cbeff85: Keep class and function names in the isolated sandbox's runtime bundle. Minifying that build mangled them, and since a class is published to player code under its own `name`, every game class arrived as a global named something like `CN` — player code touching `Creep`, `Room`, `RoomVisual` or any other class got a `ReferenceError`.
- 7070f67: Upgrade all persisted schema blobs to the current format version on load.
- a1954b3: Added `generateSector`: full sector blocks with highways, source-keeper core, and sealed borders.
- 194f9c1: Move sector geometry out of the game core into a sector mod.
- 0c2a489: Fix `makeSectorRadiusPredicate` throwing on rooms shared between sectors.
- a1fcfb7: Load shard tick processors in the main service so registered callbacks actually fire.
- 7a97cd4: Add registerShardTickProcessor; deliver Game.notify queues
- 32c9fdb: Memory accuracy improvements
- 7e055a5: Stop a socket subscription from holding its channel name after it has been unsubscribed.
- a0a9beb: Defer spawn ownership checks until after argument validation.
- 422086e: Report a creep spawned this tick as spawning the same tick.
- 0bc4d4e: Unserializable `Memory` now skips the save instead of erroring every tick
- cbe82b6: Aggregate room stat buckets into redis and serve the classic client's stat endpoints.
- d47c823: Strongholds defend themselves: tower refills, focused attacks, and rampart-bound spawned defenders.
- 5e470ab: Stronghold bunker4/5 defense: dealt populations, boosted defenders, rampart posts, tower upkeep, repairable invader ramparts.
- 354038f: Deploy stronghold structures from an invader core, removed together on collapse.
- 0d14da6: Deploy real bunker stronghold layouts with reward containers, crushing player objects on template tiles.
- 3e2afba: Send attack notifications for owned creeps and structures
- bee4717: Set the sending terminal's cooldown after `send` so it can't send every tick.
- 2ff4503: Reorder `StructureTerminal.send` validation so destination and cooldown precede the energy cost and description.
- 0bff836: `Tombstone.creep` exposes `{ type, hits }` body, `spawning`, an empty carry-sized `store`, and `saying`.
- b4587b0: Align `checkTransfer` precedence with vanilla: source-empty → target-full → amount-aware NOT_ENOUGH → amount-aware FULL
- 75cbfb7: Hoist checkUnboostCreep target ownership above the active-structure gate.
- 792c4bd: Stub `user/decorations/inventory`, `user/tutorial-done`, and `user/money-history` to silence client 404s.
- aa50979: Add the `user/overview` endpoint so the client overview page renders room previews.
- 35bffd1: Add `User.remove` and an operator script for listing, creating, and removing users.
- e7a3430: Add a `version` backend hook so mods can amend the `serverData` bag advertised at `/api/version`. Register a handler to contribute fields the client needs at connect time, e.g. `hooks.register('version', serverData => { serverData.myFeature = 1; })`, instead of patching the response via koa middleware.
- 49e85d8: Type the `serverData` bag `version` hooks amend: named features with optional client menu entries.
- f37a886: Hoist withdraw safe-mode validation before target and capacity checks.
- 5d37e1b: Reorder `withdraw` validation so invalid args, safe mode, target store compatibility, and full creep capacity take precedence over missing target resources.
- c63481e: Author sector geometry as World records anchored on their center rooms.
- 78d2322: `xxscreeps types` utility for generation of screeps.d.ts
- Updated dependencies [47dc2ff]
  - @xxscreeps/pathfinder@0.4.5

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
