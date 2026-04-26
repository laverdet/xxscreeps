---
"xxscreeps": patch
---

Reset module-level Memory state per simulation in test harness

`simulate.ts` now clears `mods/memory/memory.ts` module state (`json` /
`string` caches and `RawMemory._parsed`) at the start of each test body,
so cached Memory contents from one test don't leak into the next.
