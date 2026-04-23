# CLI Mod

Admin console for xxscreeps. Provides a VM sandbox with helpers for inspecting and managing the server, exposed via a Unix domain socket (Windows named pipe).

## Usage

### Server mode (requires running server)

Start the server in one terminal:
```
xxscreeps start
```

Connect the CLI client in another:
```
xxscreeps
```

The socket server runs in the launcher process. Each connection gets a persistent sandbox — variables survive between commands within the same session.

### Offline mode (direct database access)

```
xxscreeps offline
```

Connects directly to the database without a running server. Works with any storage provider (Redis, file://, local://), with two caveats:

- **`file://` storage is exclusive.** The blob provider takes a `.lock` on the data directory at startup, so offline CLI cannot run while the server is running on the same storage. Stop the server first, switch to Redis, or use the interactive REPL (`xxscreeps`) which shares the running server's socket.
- **`local://` storage is in-memory.** The database is empty at startup because the data only exists inside the running server process. Offline mode is designed for persistent providers.

Type `help()` at the prompt for available commands.

### Admin CLI (flag-based, one-shot)

```
xxscreeps admin <group> <command> [args...] [options]
```

The admin CLI is the friendliest surface for operational tasks. It translates shell-style invocations into a single socket call against the running server, so third-party mods that register command groups are reachable with zero client-side work.

Discoverability:

| Command | Output |
|---------|--------|
| `xxscreeps admin --help` | List of groups and global options |
| `xxscreeps admin <group> --help` | Commands in a group with destructive/interactive-only tags |
| `xxscreeps admin <group> <command> --help` | Arguments, options, examples, and safety notes |
| `xxscreeps admin completion bash` | Print the bash completion script (install with `> /etc/bash_completion.d/xxscreeps` or `source`) |

Global options (accepted before or after positionals):

- `--json` — emit structured JSON instead of formatted text
- `--force` — skip the confirmation prompt on `destructive` commands
- `--verbose` — include stack traces on errors
- `--socket <path>` — connect to a non-default CLI socket
- `--shard <name>` — scope the session to a non-default shard (defaults to the first configured shard). Session-scoped: changing shards requires reconnecting. Same flag is accepted by `xxscreeps` (REPL) and `xxscreeps offline`.
- `-h`, `--help` — print help and exit

Flag translation — how JavaScript helper signatures map to shell flags:

- Positional `Command` args become positional shell arguments in the same order. Literal kinds (`string`, `number`, `boolean`, `json`) are coerced from the raw token.
- An `object` arg expands into one `--flag value` per field of its `shape`. Field names are converted from camelCase to kebab-case, so `bots.add(name, { codeDir })` is called as `xxscreeps admin bots add <name> --code-dir <path>`.
- Fields sharing a `oneOf` key form an exclusive group: exactly one may be set on a given invocation. `bots.add`'s `{ modules | codeDir | package }` bundle is the canonical example — the CLI rejects combinations.
- `boolean` fields accept `true|false|1|0` or may appear bare (e.g., `--flag`) to mean `true`.
- `json` fields are parsed with `JSON.parse`, so strings must still be quoted (`--payload '"hello"'`).
- `callback` args (user-supplied JavaScript, e.g., `rooms.peek(name, (room, Game) => ...)`) cannot be expressed as flags. Those commands refuse to run via admin CLI and point you at the interactive REPL.

Safety:

- Commands flagged `destructive` (`system.importWorld`, `users.remove`) trigger an interactive `DESTRUCTIVE: ... Continue? [y/N]` prompt. Pipe-based/non-TTY callers must pass `--force` to bypass it. Single-target commands like `bots.remove`/`map.removeRoom` aren't flagged because the operator already named the target; the prompt is reserved for server-wide or cross-record wipes.
- Commands flagged `requiresPause` (currently `system.importWorld`) cannot be scripted across three admin invocations because a pause releases when its socket closes. The admin CLI auto-wraps these in a single `pauseSimulation` / run / `resumeSimulation` IIFE inside one socket lifetime, so you get the safety guarantee without managing the pause yourself.
- Commands flagged `interactiveOnly` (whose effect is tied to the CLI session, e.g., a manual `pauseSimulation`) are refused by the admin CLI and redirect to the interactive REPL.

## Socket Protocol

The server listens on `screeps/cli.sock` in the project directory (Windows: `\\.\pipe\xxscreeps-<hash>`). Any tool can connect using the JSON line protocol:

**Request:** `{"expression": "<javascript>"}\n`, optionally with `"shard": "<name>"` on the first message to scope the sandbox to a non-default shard.
**Response:** `{"result": "<output>"}\n` or `{"error": "<message>"}\n`. A handshake-only message (`{"shard": "<name>"}` with no `expression`) acks with `{"ok": true}`.

## Available Helpers

Run `help()` in a session for the authoritative list. Summary:

| Command | Description |
|---------|-------------|
| `db` | Global database KeyValProvider |
| `shard` | Shard KeyValProvider |
| `storage.db / .shard / .scratch / .pubsub` | Storage provider aliases |
| `users.list()` | List all users |
| `users.create(name)` | Create a new user |
| `users.remove(nameOrId)` | Remove user and clean up all data |
| `users.findByName(name)` | Look up userId by username |
| `users.info(id)` | Get user info hash |
| `auth.setPassword(nameOrId, pw)` | Set or reset a user's login password (min 8 chars; requires the password mod) |
| `bots.add(name, opts)` | Create bot with spawn (opts: `room`, `x`, `y`, `modules`/`codeDir`/`package`, optional `packageRoot`) |
| `bots.reload(name, opts)` | Re-upload bot code (opts: `modules`/`codeDir`/`package`, optional `packageRoot`) |
| `bots.remove(name)` | Remove bot, clean rooms and user data |
| `map.openRoom(name)` | Add room to active rooms set |
| `map.closeRoom(name)` | Remove room from active rooms set |
| `map.removeRoom(name)` | Close room and delete its data |
| `rooms.list()` | List all room names |
| `rooms.peek(name, task)` | Read-only game context: `task(room, Game) => result` |
| `rooms.poke(name, userId, task)` | Mutating game context; writes both double-buffer slots. Bypasses intents / pre-tick / inter-room dispatch — prefer canonical intents for standard actions |
| `shards.list()` | List configured shard names |
| `shards.info(name)` | Scriptable shard summary: `{ name, time, rooms }`. Use `--shard <name>` at connect time to run the other groups against a non-default shard. |
| `system.getTickDuration()` | Get current tick speed (ms) |
| `system.setTickDuration(ms)` | Set tick speed (ms) |
| `system.importWorld(opts?)` | Wipe all data and import a world. `opts` is `{ source?, empty? }`; default imports @screeps/launcher, `--source` loads a custom db.json, `--empty` leaves the world unimported. Requires `pauseSimulation`. |
| `system.pauseSimulation()` | Pause the game loop |
| `system.resumeSimulation()` | Resume the game loop |
| `system.sendServerMessage(msg)` | Broadcast to all players |
| `help()` | Show available commands |

Commands that mutate shard state (`users.remove`, `bots.add`, `bots.remove`, `map.closeRoom`, `map.removeRoom`, `rooms.poke`, `system.importWorld`) auto-acquire the game mutex for the duration of the call, serializing them against the processor tick loop. This is separate from the `destructive` schema flag, which only gates the admin-CLI confirmation prompt. `system.importWorld` additionally demands `pauseSimulation` first because it flushes scratch (admin CLI auto-wraps; REPL users pause manually). Call `system.pauseSimulation()` first if you want to hold the lock across multiple commands.

## Architecture

The socket server runs in the launcher process (the single coordination point), started when `importMods('launcher')` loads this mod. It shares the launcher's database and shard connections via the `launcher` hook registered in `launcher.ts`. See the [architecture overview](../../../../docs/architecture.md) for how the launcher fits alongside the main loop, runner, processor, and backend.

Each socket connection creates a persistent `vm.createContext` sandbox. Commands execute in the connection's sandbox, so variables and state persist across commands within a session. Different connections have independent sandboxes.

The CLI client (`xxscreeps` with no arguments) is a thin readline wrapper that connects to the socket. It has no game imports — just socket I/O with tab completion.

## Security model

The CLI evaluates arbitrary JavaScript via `vm.createContext`. The Unix domain socket transport restricts access to users with local filesystem permissions (the socket file lives inside the project directory), so the attack surface is equivalent to having shell access to the server process.

Both synchronous execution (VM timeout) and async operations (Promise.race) are bounded to 5 seconds to prevent accidental hangs.
