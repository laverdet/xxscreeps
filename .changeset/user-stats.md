---
"xxscreeps": patch
---

Add a first-party `stats` mod that records gameplay statistics as bucketed time series and serves them to the classic client. Per-user totals live in the account-level keyval store (aggregating across shards) and per-room series in the per-shard store. All seven classic series are recorded at their processor sites — `energyHarvested`, `energyControl`, `energyConstruction`, `energyCreeps`, `creepsProduced`, `creepsLost`, and `powerProcessed`. Per-room series are split by contributing user, so `GET /api/user/overview` shows the requesting user's own activity, `GET /api/game/room-overview` shows the room owner's, and `POST /api/game/map-stats` returns each user's contribution as a `<statName><interval>` layer. `GET /api/user/stats` returns the aggregated per-interval totals for the profile page. A removed user's stats are torn down via a new `User.remove` hook.
