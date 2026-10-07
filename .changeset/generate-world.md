---
"xxscreeps": patch
---

`xxscreeps initialize` replaces `import`. It seeds a new server with a generated sector, or with the
Steam map when passed `--preset=steam`. It refuses to replace an existing world unless
`--allow-overwrite` is passed; `--dont-overwrite` is gone.
