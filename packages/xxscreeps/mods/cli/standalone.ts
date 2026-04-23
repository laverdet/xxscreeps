import readline from 'node:readline';
import config from 'xxscreeps/config/index.js';
import { importMods } from 'xxscreeps/config/mods/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { initializeGameEnvironment } from 'xxscreeps/game/index.js';
import { PauseCoordinator, createSandbox, destroySandbox, executeCommand } from './sandbox.js';

import 'xxscreeps/config/mods/import/game.js';

await importMods('cli');
initializeGameEnvironment();

function parseShardFlag(argv: readonly string[]): string | undefined {
	for (let idx = 0; idx < argv.length; ++idx) {
		const arg = argv[idx];
		if (arg === '--shard') return argv[idx + 1];
		if (arg.startsWith('--shard=')) return arg.slice('--shard='.length);
	}
	return undefined;
}
const shardArg = parseShardFlag(process.argv.slice(2));
const shardConfig = shardArg === undefined
	? config.shards[0]
	: config.shards.find(sh => sh.name === shardArg);
if (shardConfig === undefined) {
	console.error(`Shard "${shardArg}" not configured. Available: ${config.shards.map(sh => sh.name).join(', ')}`);
	process.exit(2);
}
const db = await Database.connect();
const shard = await Shard.connect(db, shardConfig.name);
const sandbox = createSandbox(db, shard, new PauseCoordinator());

// local:// data only exists inside the server process, so the offline CLI
// sees an empty database against that provider.
const isLocal = shardConfig.data.startsWith('local://') || config.database.data.startsWith('local://');
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
	if (trimmed === '') {
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
	// `.catch(() => {})` keeps a stray rejection from poisoning the chain.
	processing = processing.catch(() => {}).then(async () => {
		try {
			console.log(await executeCommand(sandbox, line));
		} catch (err: unknown) {
			console.error(err instanceof Error ? err.message : err);
			process.exitCode = 1;
		} finally {
			if (--pending === 0 && !closed) {
				rl.prompt();
			}
		}
	});
});

await new Promise<void>(resolve => { rl.once('close', resolve); });
await processing;
await destroySandbox(sandbox);
shard.disconnect();
db.disconnect();
