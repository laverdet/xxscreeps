import type { Database, Shard } from 'xxscreeps/engine/db/index.js';

// Shared launcher context — populated by the main launcher before importMods('launcher'),
// consumed by launcher mods (e.g., CLI) that need database access without creating
// duplicate connections.
let launcherDb: Database | undefined;
let launcherShard: Shard | undefined;

export function setLauncherContext(db: Database, shard: Shard) {
	launcherDb = db;
	launcherShard = shard;
}

export function getLauncherContext() {
	if (!launcherDb || !launcherShard) {
		throw new Error('Launcher context not initialized — setLauncherContext must be called before importMods("launcher")');
	}
	return { db: launcherDb, shard: launcherShard };
}
