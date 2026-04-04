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
xxscreeps cli
```

Connects directly to the database without a running server. Works with any storage provider (Redis, file://, local://). With `local://`, the database starts empty since data is in-memory.

Type `help()` at the prompt for available commands.

## Socket Protocol

The server listens on `screeps/cli.sock` in the project directory (Windows: `\\.\pipe\xxscreeps-<hash>`). Any tool can connect using the JSON line protocol:

**Request:** `{"expression": "<javascript>"}\n`
**Response:** `{"result": "<output>"}\n` or `{"error": "<message>"}\n`

## Available Helpers

| Command | Description |
|---------|-------------|
| `db` | Global database KeyValProvider |
| `shard` | Shard KeyValProvider |
| `storage.db / .shard / .pubsub` | Storage provider aliases |
| `users.findByName(name)` | Look up userId by username |
| `users.info(id)` | Get user info hash |
| `rooms.list()` | List all room names |
| `rooms.load(name)` | Load rendered room snapshot |
| `shards.list()` | List configured shard names |
| `shards.get(name)` | Get shard context with helpers |
| `system.getTickDuration()` | Get current tick speed (ms) |
| `system.setTickDuration(ms)` | Set tick speed (ms) |
| `system.pauseSimulation()` | Pause the game loop |
| `system.resumeSimulation()` | Resume the game loop |
| `system.sendServerMessage(msg)` | Broadcast to all players |
| `help()` | Show available commands |

## Architecture

The socket server runs in the launcher process (the single coordination point), started when `importMods('launcher')` loads this mod. It shares the launcher's database and shard connections via `launcher-context.ts`.

Each socket connection creates a persistent `vm.createContext` sandbox. Commands execute in the connection's sandbox, so variables and state persist across commands within a session. Different connections have independent sandboxes.

The CLI client (`xxscreeps` with no arguments) is a thin readline wrapper that connects to the socket. It has no game imports — just socket I/O with tab completion.

## Security model

The CLI evaluates arbitrary JavaScript via `vm.createContext`. The Unix domain socket transport restricts access to users with local filesystem permissions (the socket file lives inside the project directory), so the attack surface is equivalent to having shell access to the server process.

Both synchronous execution (VM timeout) and async operations (Promise.race) are bounded to 5 seconds to prevent accidental hangs.
