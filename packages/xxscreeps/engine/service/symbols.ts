import type { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { makeHookRegistration } from 'xxscreeps/utility/hook.js';

export const hooks = makeHookRegistration<{
	/**
	 * Runs inside the launcher process after the db/shard are connected and all
	 * `launcher`-providing mods have been imported. Handlers receive the shared
	 * connections so they don't have to open their own, and their returned
	 * promises are awaited during startup. Long-lived services (e.g. the CLI
	 * socket server) should arrange their own shutdown via the service channel.
	 */
	launcher: (db: Database, shard: Shard) => void | Promise<void>;
}>();
