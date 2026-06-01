# @xxscreeps/redis

## Requirements

Redis >= 8.2. The mutex uses `SET ... IFEQ` (compare-and-set), which was
introduced in Redis 8.2; older servers fail at startup with a clear version
error.

## Sample configuration

```yaml
mods:
  - '@xxscreeps/redis'
  - xxscreeps/mods/classic
database:
  data: redis://localhost
  pubsub: redis://localhost
  saveInterval: 120
shards:
  - name: shard0
    data: redis://localhost/1
    pubsub: redis://localhost/2
    scratch: redis://localhost/2
```
