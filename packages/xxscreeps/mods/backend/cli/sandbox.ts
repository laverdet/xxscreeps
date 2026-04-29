import type { Subscription } from 'xxscreeps/engine/db/channel.js';
import type { Database } from 'xxscreeps/engine/db/index.js';
import type { World } from 'xxscreeps/game/map.js';
import * as fs from 'node:fs/promises';
import { inspect } from 'node:util';
import * as vm from 'node:vm';
import jsYaml from 'js-yaml';
import { Render } from 'xxscreeps/backend/symbols.js';
import config from 'xxscreeps/config/index.js';
import { configPath } from 'xxscreeps/config/raw.js';
import { Shard } from 'xxscreeps/engine/db/index.js';
import { Mutex } from 'xxscreeps/engine/db/mutex.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { getConsoleChannel } from 'xxscreeps/engine/runner/model.js';
import { getServiceChannel } from 'xxscreeps/engine/service/index.js';
import { tickSpeed } from 'xxscreeps/engine/service/tick.js';
import { runOneShot } from 'xxscreeps/game/index.js';
import { asUnion } from 'xxscreeps/utility/utility.js';

// Per-shard state: connection + cached terrain. Persists across CLI requests.
// Currently only shard0 exists; this map enables future multi-shard without
// reconnecting or reloading terrain on every request.
export interface ShardEntry {
	shard: Shard;
	worldCache?: World;
}
const shardEntries = new Map<string, ShardEntry>();

// Pause state is global — the game mutex controls the single main loop,
// not individual shards. Per-shard pause would require engine changes.
let pauseMutex: Mutex | undefined;
let pauseChannel: Subscription<any> | undefined;

export async function releasePause() {
	if (!pauseMutex) return;
	const mutex = pauseMutex;
	const channel = pauseChannel;
	pauseMutex = undefined;
	pauseChannel = undefined;
	channel?.disconnect();
	await mutex.unlock();
	await mutex[Symbol.asyncDispose]();
}

export function makeSystemHelpers(db: Database, entry: ShardEntry) {
	return {
		getTickDuration: () => tickSpeed,
		setTickDuration: async (ms: number) => {
			if (typeof ms !== 'number' || ms < 1) {
				return 'Invalid tick duration';
			}
			const content = await fs.readFile(configPath, 'utf8');
			const cfg: any = jsYaml.load(content) ?? {};
			cfg.game = cfg.game ?? {};
			cfg.game.tickSpeed = ms;
			await fs.writeFile(configPath, jsYaml.dump(cfg), 'utf8');
			return `Tick duration set to ${ms}ms`;
		},
		pauseSimulation: async () => {
			if (pauseMutex) return 'Simulation is already paused';
			pauseMutex = await Mutex.connect('game', entry.shard.data, entry.shard.pubsub);
			await pauseMutex.lock();
			// Release the lock on shutdown (Ctrl+C) so the main loop can exit
			const channel = pauseChannel = await getServiceChannel(entry.shard).subscribe();
			channel.listen(message => {
				if (message.type === 'shutdown') releasePause().catch(() => {});
			});
			return 'Simulation paused';
		},
		resumeSimulation: async () => {
			if (!pauseMutex) return 'Simulation is not paused';
			await releasePause();
			return 'Simulation resumed';
		},
		resetAllData: () => 'Not implemented',
		sendServerMessage: async (message: string) => {
			if (typeof message !== 'string' || !message) {
				return 'Invalid message';
			}
			const users = await db.data.smembers('users');
			const payload = JSON.stringify([ { fd: 0, data: `[Server] ${message}` } ]);
			await Promise.all(users.map(userId =>
				getConsoleChannel(entry.shard, userId).publish(payload),
			));
			return `Message sent to ${users.length} user(s)`;
		},
	};
}

export function makeRoomHelpers(entry: ShardEntry) {
	return {
		list: () => entry.shard.data.smembers('rooms'),
		load: async (name: string) => {
			const world = entry.worldCache ??= await entry.shard.loadWorld();
			const room = await entry.shard.loadRoom(name);
			return runOneShot(world, room, entry.shard.time, '0', () => {
				const objects: Record<string, any> = {};
				for (const object of room['#objects']) {
					asUnion(object);
					const rendered = object[Render]();
					if (rendered?._id) {
						objects[rendered._id] = rendered;
					}
				}
				return objects;
			});
		},
	};
}

export async function executeCommand(db: Database, shard: Shard, expression: string): Promise<string> {
	if (!expression) {
		return 'undefined';
	}

	if (!shardEntries.has(shard.name)) {
		shardEntries.set(shard.name, { shard });
	}
	const defaultEntry = shardEntries.get(shard.name)!;

	// Output capture
	const output: string[] = [];
	function print(...args: any[]) {
		output.push(args.map(arg =>
			typeof arg === 'string' ? arg : inspect(arg, { depth: 2 }),
		).join(' '));
	}

	// Build sandbox
	const sandbox = vm.createContext({
		print,
		console: { log: print, warn: print, error: print },

		db: db.data,
		shard: shard.data,
		storage: {
			db: db.data,
			shard: shard.data,
			pubsub: shard.pubsub,
		},

		// Shard-by-name access with full helpers.
		// Currently only shard0 exists; this enables future multi-shard.
		// Note: tickSpeed, setTickDuration, and pause are global (single main loop).
		shards: {
			list: () => config.shards.map(s => s.name),
			get: async (name: string) => {
				let entry = shardEntries.get(name);
				if (!entry) {
					const connected = await Shard.connect(db, name);
					entry = { shard: connected };
					shardEntries.set(name, entry);
				}
				return {
					name: entry.shard.name,
					time: entry.shard.time,
					data: entry.shard.data,
					pubsub: entry.shard.pubsub,
					rooms: makeRoomHelpers(entry),
					system: makeSystemHelpers(db, entry),
				};
			},
		},

		users: {
			findByName: (username: string) => User.findUserByName(db, username),
			info: (userId: string) => db.data.hgetall(User.infoKey(userId)),
		},

		rooms: makeRoomHelpers(defaultEntry),

		system: makeSystemHelpers(db, defaultEntry),

		help: () => [
			'Available objects and functions:',
			'  print(...args)              - Print output',
			'  db                          - Global database KeyValProvider',
			'  shard                       - Shard KeyValProvider',
			'  storage.db                  - Alias for db',
			'  storage.shard               - Alias for shard',
			'  storage.pubsub              - Shard PubSubProvider',
			'  users.findByName(name)      - Look up userId by username',
			'  users.info(id)              - Get user info hash',
			'  shards.list()               - List configured shard names',
			'  shards.get(name)            - Get shard context (name, time, data, pubsub, rooms, system)',
			'  rooms.list()                - List all room names',
			'  rooms.load(name)            - Load room snapshot (rendered objects)',
			'  system.getTickDuration()    - Get current tick speed (ms)',
			'  system.setTickDuration(ms)  - Set tick speed (ms)',
			'  system.resetAllData()       - (stub) Not implemented',
			'  system.pauseSimulation()    - Pause the game loop',
			'  system.resumeSimulation()   - Resume the game loop',
			'  system.sendServerMessage(msg) - Broadcast to all players',
			'  help()                      - Show this help',
			'  exit / quit / Ctrl+D        - Disconnect from server',
		].join('\n'),
	});

	// Execute
	const vmOptions = { filename: 'cli', timeout: 5000 };
	try {
		let result;
		if (expression.includes('await')) {
			// Top-level await: wrap in async IIFE
			let fn;
			try {
				fn = vm.runInContext(`(async()=>(${expression}))`, sandbox, vmOptions);
			} catch (err) {
				if (!(err instanceof SyntaxError)) throw err;
				fn = vm.runInContext(`(async()=>{${expression}})`, sandbox, vmOptions);
			}
			result = fn();
		} else {
			result = vm.runInContext(expression, sandbox, vmOptions);
		}

		// Handle async results (duck-type: cross-realm promises don't share constructors)
		if (result && typeof result === 'object' && typeof result.then === 'function') {
			result = await result;
		}

		const resultStr = result === undefined
			? 'undefined'
			: typeof result === 'string'
				? result
				: inspect(result, { depth: 4 });

		if (output.length > 0) {
			return output.join('\n') + '\n' + resultStr;
		}
		return resultStr;
	} catch (err: any) {
		const errorStr = err?.stack ?? String(err);
		if (output.length > 0) {
			return output.join('\n') + '\n' + errorStr;
		}
		return errorStr;
	}
}
