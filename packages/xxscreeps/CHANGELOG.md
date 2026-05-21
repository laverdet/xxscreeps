# xxscreeps

## 0.1.0

### Minor Changes

- 4178109: Reorder `createConstructionSite` checks; return `NOT_OWNER` on foreign rooms and `INVALID_ARGS` on bad spawn names
- 782525c: Reject reaction labs passed as their own reagent inputs.
- 123a1c5: Add nuker mod with launch, flight, and impact

### Patch Changes

- ac31320: Drop the backend CLI sandbox and REPL, replacing eval with host-realm execution.
- dab3531: Reorder construction creep build and repair validation precedence.
- a7b346b: Reorder controller action validation precedence.
- d8f2cc5: Reject indestructible structures from `Creep.dismantle` with `ERR_INVALID_TARGET` before range.
- 6873b3c: Fix several timing issues (dead keeper rooms, ticksToLive == 0, etc)
- c887938: Game.cpu.halt() in unsafe sandbox
- 3dbb1fc: Align Creep.harvest validation precedence with vanilla
- d34460f: Reorder link transferEnergy validation precedence
- e5d6090: Fix local `zUnionStore` to apply WEIGHTS to members present in only one input set.
- 15c7e95: Fix `Room.lookForAtArea` and `Room.lookAtArea` cell shape when `asArray` is `false`.
- 6fdd96b: Per-group notification delivery, plain transports array, fix local zadd GT/LT and zrangeWithScores ranging.
- f1e737e: Restore `rangedMassAttack` 3-tile radius and own/unowned target filter.
- 5cd5760: Floor road wear-out at `Game.time` so creep stomps can't push `#nextDecayTime` into the past.
- 1b22ba2: Match vanilla: Room.survivalInfo returns undefined instead of null.
- 5724c76: Drop game/runtime.ts stubs that shadowed real Ruin, Deposit, StructureFactory, and StructureObserver registrations.
- 7a97cd4: Add registerShardTickProcessor; deliver Game.notify queues
- 32c9fdb: Memory accuracy improvements
- a0a9beb: Defer spawn ownership checks until after argument validation.
- b4587b0: Align `checkTransfer` precedence with vanilla: source-empty → target-full → amount-aware NOT_ENOUGH → amount-aware FULL
- 75cbfb7: Hoist checkUnboostCreep target ownership above the active-structure gate.
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
