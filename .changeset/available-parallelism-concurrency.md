---
"xxscreeps": patch
---

Derive the default processor and runner `concurrency` from `os.availableParallelism()` instead of `os.cpus().length`, so a process confined by CPU affinity no longer oversubscribes itself with cores it can't run on.
