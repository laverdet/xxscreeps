---
"xxscreeps": patch
---

Fix isolated VM memory leak on code reset

- `IsolatedSandbox.dispose()` now explicitly releases the `tick` reference and clears the `isolate` handle, allowing the underlying V8 isolate to be fully destroyed.
- `createSandbox()` now disposes the sandbox if `initialize()` throws, preventing leaked isolates from partially constructed sandboxes.
- `PlayerInstance.disconnect()` now clears the `sandbox` reference after disposal.
