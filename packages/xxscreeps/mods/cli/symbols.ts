import type { CommandGroup } from './commands.js';
import type { Sandbox, ShardEntry } from './sandbox.js';
import type { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { makeHookRegistration } from 'xxscreeps/utility/hook.js';

export const hooks = makeHookRegistration<{
	/** Raw values (non-command) injected into the sandbox's global context. */
	sandbox: (db: Database, shard: Shard, getSandbox: () => Sandbox, entry: ShardEntry) =>
		Record<string, unknown>;
	/** Structured commands that drive help, tab completion, and the VM tree. */
	commands: (db: Database, shard: Shard, getSandbox: () => Sandbox, entry: ShardEntry) =>
		readonly CommandGroup[];
}>();
