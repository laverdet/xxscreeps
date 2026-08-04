---
"xxscreeps": patch
---

Fix invader raids doing no damage: `checkPath` measured spawn reachability from the invader instead of the spawn so raiders suicided on arrival, the `dismantle` which clears a path to a victim was never issued, and `shootAtWill` fired on structures including the spawn a raid is meant to leave standing.
