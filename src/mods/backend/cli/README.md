# CLI Mod

Admin console for xxscreeps. Provides a VM sandbox with helpers for inspecting and managing the server, exposed via a Unix domain socket (Windows named pipe).

## Usage

Start the server in one terminal:
```
xxscreeps start
```

Connect the CLI client in another:
```
xxscreeps
```

Type `help()` at the prompt for available commands.

## Socket Protocol

The server listens on `screeps/cli.sock` in the project directory (Windows: `\\.\pipe\xxscreeps-<hash>`). Any tool can connect using the JSON line protocol:

**Request:** `{"expression": "<javascript>"}\n`
**Response:** `{"result": "<output>"}\n` or `{"error": "<message>"}\n`

Example with `nc`:
```
echo '{"expression":"rooms.list()"}' | nc -U screeps/cli.sock
```

### Programmatic client (Node.js)

```js
import net from 'node:net';

const socket = net.connect({ path: 'screeps/cli.sock' });
socket.write(JSON.stringify({ expression: 'rooms.list()' }) + '\n');
socket.on('data', chunk => {
    const { result, error } = JSON.parse(chunk.toString().trim());
    console.log(error ?? result);
    socket.end();
});
```

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

The socket server runs in the backend process, started via a `backendReady` hook. It shares the backend's database connection. Each command creates a fresh `vm.createContext` sandbox with the helpers above. Commands are processed sequentially per connection.

The CLI client (`xxscreeps` with no arguments) is a thin readline wrapper that connects to the socket. It has no game imports — just socket I/O with tab completion.
