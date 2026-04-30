import * as repl from 'node:repl';
import { inspect } from 'node:util';
import { ArgumentParser } from 'argparse';
import config from 'xxscreeps/config/index.js';
import { importMods } from 'xxscreeps/config/mods/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { GameState, hooks, initializeGameEnvironment } from 'xxscreeps/game/index.js';
import { evaluate } from './evaluate.js';

interface Argv {
	eval?: string;
}

const parser = new ArgumentParser({
	prog: 'xxscreeps cli',
	description: 'Read-only console attached to the configured shard',
});
parser.add_argument('-e', '--eval', {
	dest: 'eval',
	help: 'Evaluate <expression> and exit',
	metavar: '<expression>',
});
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const argv: Argv = parser.parse_args();

// Connect to the configured DB and shard. `Database.connect` transparently routes through the
// launcher's responder socket when one is running; otherwise this CLI process holds the lock.
using db = await Database.connect();
using shard = await Shard.connect(db, config.shards[0].name);

// Materialize the runtime environment. `initializeGameEnvironment` runs the engine-wide
// `environment` hook chain. Then we fire `runtimeConnector.initialize` for every mod with an
// empty payload — that populates globalThis with player constants, class globals, and lodash.
// `Memory` is wired in `runtimeConnector.receive`, which we never fire, so it stays absent.
await importMods('game');
initializeGameEnvironment();
for (const hook of hooks.map('runtimeConnector')) {
	hook.initialize?.({} as never);
}

// Snapshot the committed shard. Every committed room is loaded so admins see the full world,
// not a per-user view. The snapshot is taken once at startup; later ticks won't appear in the
// session until you reconnect.
const world = await shard.loadWorld();
const roomNames = await shard.data.smembers('rooms');
const rooms = await Promise.all(Fn.map(roomNames, name => shard.loadRoom(name)));
const state = new GameState(world, shard.time, rooms);

if (argv.eval === undefined) {
	const server = repl.start({
		prompt: 'xxscreeps> ',
		useGlobal: true,
		eval(cmd, _context, _filename, callback) {
			if (cmd.trim() === '') {
				callback(null, undefined);
				return;
			}
			evaluate(state, cmd).then(
				value => callback(null, value),
				err => callback(err as Error, null));
		},
	});
	server.on('exit', () => process.exit(0));
} else {
	let exitCode = 0;
	try {
		const result = await evaluate(state, argv.eval);
		process.stdout.write(`${inspect(result)}\n`);
	} catch (err) {
		const message = err instanceof Error ? err.stack ?? err.message : String(err);
		process.stderr.write(`${message}\n`);
		exitCode = 1;
	}
	process.exit(exitCode);
}
