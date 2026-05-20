# xxscreeps CLI

Operator-facing JavaScript REPL and one-shot evaluator.

- `xxscreeps cli` evaluates each line against the launcher's `db`/`shard` when the launcher's RPC
  socket is reachable (**launcher mode**), or in the CLI's own process otherwise (**direct mode**).
- `xxscreeps eval` always runs in the CLI's own process.

## Commands

### `xxscreeps cli`

Interactive REPL backed by `node:repl`. Bare `xxscreeps` (no subcommand) is an alias. No flags — the
backend is picked at startup by inspecting the configured storage provider, then probing the
launcher RPC socket if the provider is local. The banner names the chosen mode (`connected to
launcher RPC at …` or `… running direct REPL`) and the prompt is `xxscreeps live>` or `xxscreeps>`
accordingly.

- Top-level declarations (`let`, `const`, `var`) persist across turns, including on the same line as
  `await` — `let user = await db.users.findByName('foo')` then `user.name` works. The hoist
  rewrites them as `var`, so `const` immutability isn't preserved and class/function declarations
  don't persist; bind via `let C = class { … }` if you need a class to survive turns.
- Top-level `await` works at the prompt.
- Multi-line input is recoverable: typing `if (x) {` reprompts until the block closes.
- `node:repl` meta-commands (`.help`, `.exit`, `.load`, `.save`, `.editor`, `.clear`) work as in
  plain `node`.

### `xxscreeps eval`

One-shot evaluator. Always runs in the host realm. Source comes from exactly one of
`-e/--expression`, `--file`, or `--stdin`.

| Flag | Description |
|---|---|
| `-e, --expression <code>` | Evaluate a string |
| `--file <path>` | Read a file (cwd-relative or absolute) |
| `--stdin` | Read source from stdin until EOF |
| `-- arg …` | Trailing positionals exposed inside the script as `argv: string[]` |


## Modes

Launcher and direct describe *where* code runs, not whether the engine is running. With a networked
storage provider the engine may well be live; the CLI just reaches it through storage rather than
sharing a process.

| | Launcher | Direct |
|---|---|---|
| Process | Inside the running launcher, one `vm.Context` per connection | The CLI's own process, host realm |
| `db` / `shard` | Pre-bound to the launcher's instances | Not bound — construct your own if needed |
| Pre-flush in-memory state | Visible | Not visible (storage only) |
| Concurrent sessions | Isolated per connection | Each runs in its own process |
| When picked | Local provider + launcher up | Networked provider, or no launcher up |

### Launcher

When `xxscreeps start` is running against a local provider it listens on a Unix socket (or Windows
named pipe) at `screeps/cli.sock` next to `.screepsrc.yaml`. `xxscreeps cli` auto-detects that
socket and forwards each REPL line over a persistent connection.

Each connection gets its own `node:vm` context, retained for the connection's lifetime. Bindings:

| Helper | Source |
|---|---|
| `db` | The launcher's `Database` instance |
| `shard` | The launcher's default `Shard` instance |
| `console` | Each request's output drains into that request's response |
| `print` | Alias for `console.log` |
| `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval` | Node timer intrinsics |

Nothing else — `Game`, `Memory`, `rooms`, `users` aren't bound; those land with the domain commands
that need them. Vars persist across turns on a single connection; two parallel `xxscreeps cli`
sessions to the same launcher each get an isolated context.

Pass `--no-launcher-rpc` to `xxscreeps start` to launch without the RPC socket; the CLI then always
falls back to direct mode.

### Direct

Operator code runs in the CLI process's host realm. `process`, `require`, dynamic `import()`,
`Buffer`, `__dirname`, `__filename`, every node built-in, and every npm dependency the launcher
loads are all reachable. Operators already have shell access to the same machine — the prompt isn't
a security boundary.

`argv` (eval only) is exposed as a global populated from trailing positionals.

`db` and `shard` aren't pre-bound. Construct them yourself if you need them — for a networked
provider this connects to the same data the launcher is reading and writing, so direct mode against
a running Redis is "live state, separate process," not offline. For a local provider with no
launcher up you're touching the files directly; doing that against a running launcher is unsafe
because the local provider isn't designed for concurrent writers.

## Mode selection

`xxscreeps cli` picks its mode by inspecting `config.database.data`:

- Networked providers (`redis:`, future `postgres:`) → direct mode. No RPC probe; there's no
  in-process state to share, and storage is already the rendezvous point.
- Local file-backed providers (`file:`, `local:`) → probe the launcher RPC socket. On `connect`
  success the REPL goes launcher; on failure (no launcher, refused, stale inode), fall back to
  direct mode and print why.

## Limitations

- **No async runaway timeout.** `vm.Script` covers sync runaways only; an async loop
  (`while(true) await new Promise(r => setTimeout(r, 0))`) can hang a REPL turn until the operator
  interrupts the launcher. Launcher shutdown also waits for any in-flight RPC eval to finish.
- **One RPC per config.** A second `xxscreeps start` for the same config refuses to launch on
  socket-in-use.
- **No multi-shard handshake.** The launcher RPC serves the launcher's default shard. Deferred to a
  later slice.
- **Unix permissions.** Socket file `0o600`, parent directory `0o700`. The RPC socket is reachable
  only to the launcher's UID.
- **Windows.** Named pipes don't carry Unix permissions; the pipe is reachable by any local-machine
  user. Run on Unix for deployments where that matters.
