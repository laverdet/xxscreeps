# xxscreeps CLI

Operator-facing JavaScript REPL and one-shot evaluator. Both run inside the CLI process's host realm
— operator typing has the same access the launcher does. There is no `vm.Context`, no curated
globals list.

## Commands

### `xxscreeps cli`

Interactive REPL backed by `node:repl`. Bare `xxscreeps` (no subcommand) is an alias.

- Variables persist across turns: `var x = 1; x` then `x + 1` works.
- Top-level `await` works at the prompt.
- Multi-line input is recoverable: typing `if (x) {` reprompts until the block closes.
- `node:repl` defaults are unchanged — meta-commands (`.help`, `.exit`, `.load`, `.save`, `.editor`,
  `.clear`) work as in plain `node`.

### `xxscreeps eval`

One-shot evaluator. Source comes from exactly one of `-e/--expression`, `--file`, or `--stdin`.

| Flag | Description |
|---|---|
| `-e, --expression <code>` | Evaluate a string |
| `--file <path>` | Read a file (cwd-relative or absolute) |
| `--stdin` | Read source from stdin until EOF |
| `-- arg …` | Trailing positionals exposed inside the script as `argv: string[]` |


## Realm

Operator code runs in the CLI process's host realm. `process`, `require`, dynamic `import()`,
`Buffer`, `__dirname`, `__filename`, every node built-in, and every npm dependency the launcher
loads are all reachable. Operators already have shell access to the same machine — the prompt isn't
a security boundary.

`argv` (eval only) is exposed as a global populated from trailing positionals.

No engine state is exposed: `Game`, `Memory`, `shard`, and `db` are absent because the engine is not
running. A live-mode bridge that runs eval on the engine side and exposes that state through a Unix
socket is a planned follow-up.
