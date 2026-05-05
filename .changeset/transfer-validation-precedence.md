---
"xxscreeps": patch
---

Align `checkTransfer` precedence with vanilla: reject targets without a `Store`, validate resource type and amount earlier, and interleave NOT_ENOUGH and FULL the way vanilla does (source-empty → target-full → amount-aware NOT_ENOUGH → amount-aware FULL).
