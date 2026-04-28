# xxscreeps

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
- e8255b4: Reclaim body energy on Spawn.recycleCreep

## 0.0.7

### Patch Changes

- dbf3d6f: A bunch of changes
- Updated dependencies [df06ba1]
  - @xxscreeps/pathfinder@0.0.2
