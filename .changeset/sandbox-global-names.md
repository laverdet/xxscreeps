---
"xxscreeps": patch
---

Keep class and function names in the isolated sandbox's runtime bundle. Minifying that build mangled them, and since a class is published to player code under its own `name`, every game class arrived as a global named something like `CN` — player code touching `Creep`, `Room`, `RoomVisual` or any other class got a `ReferenceError`.
