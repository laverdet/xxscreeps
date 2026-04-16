# @xxscreeps/redis

Sample configuration:

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
