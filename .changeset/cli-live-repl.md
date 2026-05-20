---
"xxscreeps": minor
---

Add a live REPL to `xxscreeps cli`. When the launcher is running against a local provider the REPL auto-detects its RPC socket and forwards each input over a persistent connection, sharing the launcher's `db` and `shard`; otherwise it falls back to the existing host-realm evaluator. `xxscreeps eval` remains host-realm only.
