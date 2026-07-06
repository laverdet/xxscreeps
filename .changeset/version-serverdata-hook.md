---
"xxscreeps": patch
---

Add a `version` backend hook so mods can amend the `serverData` bag advertised at `/api/version`. Register a handler to contribute fields the client needs at connect time, e.g. `hooks.register('version', serverData => { serverData.myFeature = 1; })`, instead of patching the response via koa middleware.
