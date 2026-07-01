---
"xxscreeps": patch
---

Add a first-party `stats` mod that records gameplay statistics as bucketed time series and serves them to the classic client. Per-user totals live in the account-level keyval store (aggregating across shards) and per-room series in the per-shard store. All seven classic series are recorded at their processor sites — `energyHarvested`, `energyControl`, `energyConstruction`, `energyCreeps`, `creepsProduced`, `creepsLost`, and `powerProcessed`. `GET /api/user/stats` returns the aggregated per-interval totals for the profile page, `GET /api/user/overview` returns real totals plus per-room punchcards (`stats`/`statsMax`) for the selected stat and interval, and `GET /api/game/room-overview` returns a room's owner, per-stat punchcards, per-stat maxima and windowed totals. A removed user's stats are torn down via a new `User.remove` hook.
