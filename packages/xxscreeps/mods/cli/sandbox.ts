import type { Database } from 'xxscreeps/engine/db/index.js';
import type { World } from 'xxscreeps/game/map.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs/promises';
import { inspect } from 'node:util';
import vm from 'node:vm';
import jsYaml from 'js-yaml';
import config from 'xxscreeps/config/index.js';
import { configPath } from 'xxscreeps/config/raw.js';
import { Shard } from 'xxscreeps/engine/db/index.js';
import { Mutex } from 'xxscreeps/engine/db/mutex.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { getConsoleChannel } from 'xxscreeps/engine/runner/model.js';
import { getServiceChannel } from 'xxscreeps/engine/service/index.js';
import { tickSpeed } from 'xxscreeps/engine/service/tick.js';
import { runOneShot } from 'xxscreeps/game/index.js';
import { Render } from 'xxscreeps/game/render.js';
import { asUnion } from 'xxscreeps/utility/utility.js';

const asyncTimeout = 5000;

export interface ShardEntry {
	shard: Shard;
	worldCache?: World;
}

interface OutputCapture {
	active: boolean;
	lines: string[];
}

export interface Sandbox {
	context: vm.Context;
	defaultShardName: string;
	output: AsyncLocalStorage<OutputCapture>;
	shardEntries: Map<string, ShardEntry>;
	destroyed: boolean;
}

// Pause state is global — the game mutex controls the single main loop
let pauseMutex: Mutex | undefined;
let pauseCleanup: { disconnect: () => void } | undefined;
let pauseOwner: Sandbox | undefined;

export async function releasePause() {
	if (!pauseMutex) return;
	const mutex = pauseMutex;
	const cleanup = pauseCleanup;
	pauseMutex = undefined;
	pauseCleanup = undefined;
	pauseOwner = undefined;
	await mutex.unlock();
	await mutex.disconnect();
	cleanup?.disconnect();
}

function formatOutput(args: readonly unknown[]) {
	return args.map(arg =>
		typeof arg === 'string' ? arg : inspect(arg, { depth: 2 }),
	).join(' ');
}

function makeOutputWriter(
	output: AsyncLocalStorage<OutputCapture>,
	fallback: (line: string) => void,
) {
	return (...args: unknown[]) => {
		const line = formatOutput(args);
		const capture = output.getStore();
		if (capture?.active) {
			capture.lines.push(line);
		} else {
			fallback(line);
		}
	};
}

function makeSystemHelpers(db: Database, getSandbox: () => Sandbox, entry: ShardEntry) {
	return {
		getTickDuration: () => tickSpeed,
		setTickDuration: async (ms: number) => {
			if (typeof ms !== 'number' || ms < 1) {
				return 'Invalid tick duration';
			}
			const content = await fs.readFile(configPath, 'utf8');
			const cfg = (jsYaml.load(content) ?? {}) as Partial<Record<string, Record<string, unknown>>>;
			const game = cfg.game ??= {};
			game.tickSpeed = ms;
			await fs.writeFile(configPath, jsYaml.dump(cfg), 'utf8');
			// tickSpeed updates asynchronously via the config file watcher
			return `Tick duration set to ${ms}ms (takes effect next tick)`;
		},
		pauseSimulation: async () => {
			if (pauseMutex) return 'Simulation is already paused';
			const mutex = await Mutex.connect('game', entry.shard.data, entry.shard.pubsub);
			await mutex.lock();
			pauseMutex = mutex;
			pauseOwner = getSandbox();
			// Release the lock on shutdown (Ctrl+C) so the main loop can exit
			const channel = await getServiceChannel(entry.shard).subscribe();
			pauseCleanup = channel;
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

function makeRoomHelpers(entry: ShardEntry) {
	return {
		list: () => entry.shard.data.smembers('rooms'),
		load: async (name: string) => {
			// Cached for the connection lifetime; won't reflect rooms added/removed mid-session
			const world = entry.worldCache ??= await entry.shard.loadWorld();
			const room = await entry.shard.loadRoom(name);
			return runOneShot(world, room, entry.shard.time, '0', () => {
				const objects: Record<string, Record<string, unknown>> = {};
				for (const object of room['#objects']) {
					asUnion(object);
					const rendered = object[Render]();
					if (rendered?._id !== undefined) {
						objects[rendered._id] = rendered;
					}
				}
				return objects;
			});
		},
	};
}

/** Build a persistent VM context with all CLI helpers. One per connection. */
export function createSandbox(db: Database, shard: Shard): Sandbox {
	const output = new AsyncLocalStorage<OutputCapture>();
	const shardEntries = new Map<string, ShardEntry>([
		[ shard.name, { shard } ],
	]);
	const print = makeOutputWriter(output, console.log);
	const capturedConsole = {
		error: makeOutputWriter(output, console.error),
		log: print,
		warn: makeOutputWriter(output, console.warn),
	};
	let sandbox: Sandbox | undefined;
	const getSandbox = () => {
		if (!sandbox) {
			throw new Error('Sandbox not initialized');
		}
		return sandbox;
	};
	const defaultEntry = shardEntries.get(shard.name)!;

	sandbox = {
		context: vm.createContext({
			print,
			console: capturedConsole,

			// Timer globals — vm contexts don't include them by default
			setTimeout,
			setInterval,
			clearTimeout,
			clearInterval,

			db: db.data,
			shard: shard.data,
			storage: {
				db: db.data,
				shard: shard.data,
				pubsub: shard.pubsub,
			},

			shards: {
				list: () => config.shards.map(sh => sh.name),
				get: async (name: string) => {
					let entry = shardEntries.get(name);
					if (!entry) {
						entry = { shard: await Shard.connect(db, name) };
						shardEntries.set(name, entry);
					}
					return {
						name: entry.shard.name,
						time: entry.shard.time,
						data: entry.shard.data,
						pubsub: entry.shard.pubsub,
						rooms: makeRoomHelpers(entry),
						system: makeSystemHelpers(db, getSandbox, entry),
					};
				},
			},

			users: {
				findByName: (username: string) => User.findUserByName(db, username),
				info: (userId: string) => db.data.hgetall(User.infoKey(userId)),
			},

			rooms: makeRoomHelpers(defaultEntry),

			system: makeSystemHelpers(db, getSandbox, defaultEntry),

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
		}),
		defaultShardName: shard.name,
		destroyed: false,
		output,
		shardEntries,
	};
	return sandbox;
}

export async function destroySandbox(sandbox: Sandbox) {
	if (sandbox.destroyed) {
		return;
	}
	sandbox.destroyed = true;
	if (pauseOwner === sandbox) {
		await releasePause();
	}
	for (const [ name, entry ] of sandbox.shardEntries) {
		if (name !== sandbox.defaultShardName) {
			entry.shard.disconnect();
		}
	}
	sandbox.shardEntries.clear();
}

/** Run an expression in an existing sandbox context. Output is captured per-call. */
export async function executeCommand(sandbox: Sandbox, expression: string): Promise<string> {
	if (!expression) {
		return 'undefined';
	} else if (sandbox.destroyed) {
		throw new Error('Sandbox destroyed');
	}

	const capture: OutputCapture = { active: true, lines: [] };
	return sandbox.output.run(capture, async () => {
		const vmOptions = { filename: 'cli', timeout: asyncTimeout };
		try {
			const raw: unknown = /\bawait\b/.test(expression)
				? compileAsync(expression, sandbox.context, vmOptions)()
				: vm.runInContext(expression, sandbox.context, vmOptions);

			// Resolve async results with timeout (duck-type: cross-realm promises lack shared constructors)
			const isThenable = raw !== null && typeof raw === 'object' &&
				'then' in raw && typeof raw.then === 'function';
			let timer: NodeJS.Timeout | undefined;
			const result: unknown = isThenable
				? await Promise.race([
					(raw as Promise<unknown>).finally(() => clearTimeout(timer)),
					new Promise<never>((_resolve, reject) => {
						timer = setTimeout(() => reject(new Error('Async execution timed out')), asyncTimeout);
					}),
				])
				: raw;

			const resultStr = result === undefined
				? 'undefined'
				: typeof result === 'string'
					? result
					: inspect(result, { depth: 4 });

			return capture.lines.length > 0
				? capture.lines.join('\n') + '\n' + resultStr
				: resultStr;
		} catch (err: unknown) {
			const errorStr = err instanceof Error ? err.stack ?? err.message : String(err);
			return capture.lines.length > 0
				? capture.lines.join('\n') + '\n' + errorStr
				: errorStr;
		} finally {
			capture.active = false;
		}
	});
}

// Parse as expression first, fall back to statement block on SyntaxError.
// Neither form invokes user code — side effects only happen when the returned function is called.
// Note: cross-realm errors from vm.runInContext don't satisfy `instanceof SyntaxError`,
// so we check err.name instead.
function compileAsync(expression: string, sandbox: vm.Context, options: vm.RunningScriptOptions) {
	try {
		return vm.runInContext(`(async()=>(${expression}))`, sandbox, options) as () => Promise<unknown>;
	} catch (err: unknown) {
		const name = err !== null && typeof err === 'object' && 'name' in err ? err.name : undefined;
		if (name !== 'SyntaxError') throw err;
		return vm.runInContext(`(async()=>{${expression}})`, sandbox, options) as () => Promise<unknown>;
	}
}
