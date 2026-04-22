import { importMods } from 'xxscreeps/config/mods/index.js';
import { hooks } from 'xxscreeps/engine/service/symbols.js';
import { initializeGameEnvironment } from 'xxscreeps/game/index.js';
import { startSocketServer } from './socket.js';

import 'xxscreeps/config/mods/import/game.js';

// Load cli.ts so its sandbox/commands hook registrations run before any
// client connects.
await importMods('cli');

hooks.register('launcher', async (db, shard) => {
	initializeGameEnvironment();
	try {
		await startSocketServer(db, shard);
	} catch (err: unknown) {
		console.error('CLI socket server failed to start:', err instanceof Error ? err.message : err);
	}
});
