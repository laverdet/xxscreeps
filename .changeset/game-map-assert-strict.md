---
"xxscreeps": patch
---

Drop the `node:assert/strict` import from `game/map.ts`, which the runtime bundler cannot resolve inside the isolated-vm sandbox.
