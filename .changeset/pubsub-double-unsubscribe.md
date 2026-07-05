---
"xxscreeps": patch
---

Fix a crash (`Cannot read properties of undefined (reading 'subscribers')`) in `RedisPubSubProvider.unsubscribe` that could take down the backend's socket handling. When several subscribers share one channel key (e.g. a room's shared and per-socket listeners), the previous size-based teardown could delete the whole delegate entry while a live subscriber remained — or race with an in-flight subscribe — leaving a later unsubscribe to dereference a missing entry. Unsubscribe now removes only its own subscriber, is a no-op if the entry or subscriber is already gone, and drops the shared Redis subscription only once the last subscriber leaves.
