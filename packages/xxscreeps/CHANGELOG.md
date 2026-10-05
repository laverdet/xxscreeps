# xxscreeps

## 0.2.0

### Minor Changes

- 019eb5f: Generate deposits in highway rooms on a per-sector schedule.
- b021640: Add `StructureInvaderCore` defender spawning.
- 23de927: Add `StructureInvaderCore` NPC actions and deploy/collapse expiry.
- bb5dcf2: Rank players on monthly leaderboards for control points and power processed.
- 0bf9351: Add `Game.market.createOrder`
- d0850fd: Place power banks in highway rooms on a per-room respawn timer.
- 123a1c5: Add nuker mod with launch, flight, and impact
- 5696d86: Add `RoomObject.effects`.

### Patch Changes

- b951066: Allow signing in with an email address.
- 36d52b4: Add a badge `symbols` hook so mods may grant svg symbols.
- 1340900: Add `manage bot` verbs to add, update, and remove bots.
- ac31320: Add `xxscreeps cli` and `xxscreeps eval`, replacing the backend CLI sandbox.
- 45e1f87: Send notifications for controller level-up, pre-downgrade warning, and downgrade.
- 8ccf1a4: Serve the decorations catalog, inventory, and placements to the client.
- 4aa60b9: Add the `decorations` mod with yaml-authored asset packs.
- 92da93e: Decorations are opt-in via `decorations.grantAll` and `decorations.inventory`.
- 8f49545: Add per-user decoration grants and placement, with `manage decoration`.
- 6d0ffb7: Add `xxscreeps export`, writing the shard's world as a payload JSON file.
- c887938: Add `Game.cpu.halt()` to the unsafe sandbox.
- 4795a33: `xxscreeps import` seeds from a bundled world payload instead of `@screeps/launcher`.
- 6de7255: `xxscreeps import` takes `--shard` to seed a shard other than the first configured one.
- 178e409: Render invader core level, deploy time, and invulnerability effect to the client.
- 8eda2a0: Emit lab reaction and reverse-reaction action logs to clients.
- 06d8cbf: Faster pathfinder
- fe0ea3d: `manage game pause-tick` takes a step count and reports each tick stepped.
- 8cbdfdf: `xxscreeps manage` takes `--shard` to act on a shard other than the first configured one.
- 47fc54e: Add user badge, password, and branch verbs to the manage script.
- c544687: Add minerals0 (type and density) to /api/game/map-stats response.
- 701f30d: Record terminal transfers in `Game.market.incomingTransactions` and `outgoingTransactions`.
- 61a804b: Add `/api/user/memory-segment` endpoints.
- 02d4f74: Add power creep accounts: GPL-gated create/upgrade/rename/delete and `Game.powerCreeps`.
- 8f5c041: Spawn power creeps into rooms, with aging, renew, and death.
- 1d4db69: Add `PowerCreep.enableRoom` and `usePower`, with `PWR_GENERATE_OPS` as the first power.
- c0ebd5d: Add `PWR_OPERATE_FACTORY`.
- 22c212b: Add power bank structures with decay, hit-back, and ruin looting.
- 8e6a71b: Add power spawns that process power into Global Power Level.
- bff10c8: Add private messaging.
- 062d213: Expose `require.cache` on the player runtime so module entries can be deleted.
- 8533d8e: Generated rooms include sources, a controller, a mineral, and keeper lairs.
- 3bae39c: Add an offline `generate-room` command that procedurally generates a room's terrain.
- a1954b3: Add a `generate-sector` command: full sectors with highways and a source-keeper core.
- 7a97cd4: Add registerShardTickProcessor; deliver Game.notify queues
- cbe82b6: Serve room and user stats to the classic client's stat endpoints.
- d47c823: Strongholds defend themselves: tower refills, focused attacks, and spawned defenders.
- 5e470ab: Add stronghold bunker4/5 defense with boosted defenders and repairable ramparts.
- b87582d: Loot the ruin of a damage-destroyed invader core.
- 354038f: Deploy stronghold structures from an invader core, removed together on collapse.
- 0d14da6: Deploy real bunker stronghold layouts with reward containers.
- 3e2afba: Send attack notifications for owned creeps and structures
- aa50979: Add the `user/overview` endpoint so the client overview page renders room previews.
- 35bffd1: Add `User.remove` and an operator script for listing, creating, and removing users.
- e7a3430: Add a `version` backend hook so mods can amend `serverData` at `/api/version`.
- 78d2322: `xxscreeps types` utility for generation of screeps.d.ts

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
