---
"xxscreeps": patch
---

Wire up missing `Room.getEventLog()` events and reshape the player-facing payload to vanilla's `{event, objectId, data?}` shape.

Newly emitted: `EVENT_BUILD`, `EVENT_REPAIR`, `EVENT_TRANSFER`, `EVENT_EXIT`, `EVENT_ATTACK_CONTROLLER`, `EVENT_RESERVE_CONTROLLER`, `EVENT_UPGRADE_CONTROLLER`, `EVENT_OBJECT_DESTROYED` (on creep death, structure destruction by attack/dismantle, and container decay), and `EVENT_ATTACK` for the previously-unwired `DISMANTLE` and `HIT_BACK` `attackType` variants. Each event is emitted exactly once at the intent processor that performs the action; `Creep.prototype['#applyDamage']` no longer emits, keeping damage application and event recording decoupled. `EVENT_OBJECT_DESTROYED` is gated on the alive→dead transition so multi-attacker ticks don't duplicate it.

`EVENT_BUILD` carries `structureType`, `x`, `y`, and `incomplete` to match vanilla's payload.

Closes #107. Verified against screeps-ok.
