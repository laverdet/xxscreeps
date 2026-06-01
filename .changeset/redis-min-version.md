---
"@xxscreeps/redis": patch
---

Require Redis >= 8.2 (mutex uses `SET ... IFEQ`); probe version at connect.
