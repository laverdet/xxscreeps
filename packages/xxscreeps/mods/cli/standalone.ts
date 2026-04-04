import readline from 'node:readline';
import config from 'xxscreeps/config/index.js';
import { importMods } from 'xxscreeps/config/mods/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { initializeGameEnvironment } from 'xxscreeps/game/index.js';
import { createSandbox, destroySandbox, executeCommand } from './sandbox.js';

import 'xxscreeps/config/mods/import/game.js';

await importMods('render');
initializeGameEnvironment();

const db = await Database.connect();
const shard = await Shard.connect(db, 'shard0');
const sandbox = createSandbox(db, shard);

// Warn when storage providers are in-memory — offline CLI connects to live DB state,
// but local:// data only exists inside the server process.
const shardConfig = config.shards.find(sh => sh.name === 'shard0');
const isLocal = shardConfig?.data.startsWith('local://') === true || config.database.data.startsWith('local://');
console.log('xxscreeps CLI (offline — direct database access)');
if (isLocal) {
	console.log('\n\u26A0 Storage provider is local:// (in-memory). Database will be empty.');
	console.log('  For live data access, start the server with `xxscreeps start` and connect with `xxscreeps`.');
	console.log('  Offline CLI is designed for persistent providers (Redis, file://).');
}
console.log('\nType help() for available commands.\n');

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	prompt: '> ',
});
let pending = 0;
let processing = Promise.resolve();
let closed = false;
rl.prompt();

rl.on('line', line => {
	const trimmed = line.trim();
	if (!trimmed) {
		if (pending === 0) {
			rl.prompt();
		}
		return;
	}
	if (trimmed === 'quit' || trimmed === 'exit') {
		closed = true;
		rl.close();
		return;
	}
	++pending;
	processing = processing.then(async () => {
		try {
			console.log(await executeCommand(sandbox, line));
		} catch (err: unknown) {
			console.error(err instanceof Error ? err.message : err);
		} finally {
			if (--pending === 0 && !closed) {
				rl.prompt();
			}
		}
	});
});

await new Promise<void>(resolve => rl.once('close', resolve));
await processing;
await destroySandbox(sandbox);
shard.disconnect();
db.disconnect();
