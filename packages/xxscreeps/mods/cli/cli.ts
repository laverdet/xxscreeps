import type { CommandGroup } from './commands.js';
import type { Sandbox, ShardEntry } from './sandbox.js';
import type { Database, Shard as ShardType } from 'xxscreeps/engine/db/index.js';
import type { CodePayload } from 'xxscreeps/engine/db/user/code.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as Path from 'node:path';
import jsYaml from 'js-yaml';
import config from 'xxscreeps/config/index.js';
import { configPath } from 'xxscreeps/config/raw.js';
import { Shard } from 'xxscreeps/engine/db/index.js';
import { Mutex } from 'xxscreeps/engine/db/mutex.js';
import * as Code from 'xxscreeps/engine/db/user/code.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { activeRoomsKey, pushIntentsForRoomNextTick, sleepingRoomsKey, userToPresenceRoomsSetKey } from 'xxscreeps/engine/processor/model.js';
import { getConsoleChannel } from 'xxscreeps/engine/runner/model.js';
import { generateId } from 'xxscreeps/engine/schema/id.js';
import { getServiceChannel } from 'xxscreeps/engine/service/index.js';
import { getInvalidationChannel } from 'xxscreeps/engine/service/invalidation.js';
import { tickSpeed } from 'xxscreeps/engine/service/tick.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, runOneShot } from 'xxscreeps/game/index.js';
import * as MapSchema from 'xxscreeps/game/map.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { flushUsers } from 'xxscreeps/game/room/room.js';
import { checkCreateConstructionSite } from 'xxscreeps/mods/construction/room.js';
import { kMaxMemorySegmentId } from 'xxscreeps/mods/memory/memory.js';
import { makeWriter } from 'xxscreeps/schema/write.js';
import { spread } from 'xxscreeps/utility/async.js';
import { CliError, clearAllWorldCaches, withGameLock } from './commands.js';
import { ECHO } from './sandbox.js';
import { hooks } from './symbols.js';

const MAX_MODULE_BYTES = 16 << 20;
const MAX_MODULE_FILES = 1024;
const writeTerrain = makeWriter(MapSchema.schema);

export async function resolveModules(opts: {
	modules?: Record<string, string>;
	codeDir?: string;
	package?: string;
	// node_modules root for `package` lookup; resolved against process.cwd().
	packageRoot?: string;
}): Promise<CodePayload> {
	if (opts.packageRoot !== undefined && opts.package === undefined) {
		throw new CliError('packageRoot requires package');
	}
	if (opts.modules) {
		return new Map(Object.entries(opts.modules));
	}
	if (opts.package !== undefined) {
		const resolveOptions = opts.packageRoot === undefined
			? undefined
			: { paths: [ Path.resolve(process.cwd(), opts.packageRoot) ] };
		return resolveFromPackage(opts.package, resolveOptions);
	}
	if (opts.codeDir !== undefined) {
		return resolveFromCodeDir(opts.codeDir);
	}
	throw new CliError('One of modules, codeDir, or package is required');
}

async function resolveFromCodeDir(dir: string): Promise<CodePayload> {
	// Caps guard against a typo like `codeDir: '/'` walking the whole filesystem.
	const candidates = [ ...Fn.filter(await fs.readdir(dir, { recursive: true }), file => /\.(js|wasm)$/.test(file)) ];
	if (candidates.length > MAX_MODULE_FILES) {
		throw new CliError(`Too many module files in ${dir} (${candidates.length}; max ${MAX_MODULE_FILES})`);
	}
	const entries = new Map<string, string | Uint8Array>();
	let totalBytes = 0;
	await spread(8, candidates, async file => {
		const full = Path.join(dir, file);
		const content = file.endsWith('.wasm')
			? await fs.readFile(full)
			: await fs.readFile(full, 'utf8');
		const size = typeof content === 'string' ? Buffer.byteLength(content, 'utf8') : content.byteLength;
		totalBytes += size;
		if (totalBytes > MAX_MODULE_BYTES) {
			throw new CliError(`Module payload exceeded ${MAX_MODULE_BYTES} bytes while reading ${dir}`);
		}
		const moduleName = file.replace(/\.(js|wasm)$/, '').replace(/\\/g, '/');
		if (entries.has(moduleName)) {
			throw new CliError(`Duplicate module name ${moduleName} under ${dir}`);
		}
		entries.set(moduleName, content);
	});
	if (entries.size === 0) {
		throw new CliError(`No .js or .wasm files found in ${dir}`);
	}
	return entries;
}

// Screeps runtime requires the entry module to be named `main`. For flat-layout
// packages (main at package root), ship main-only so scraping doesn't pick up
// tests/docs/build tooling.
export async function resolveFromPackage(
	packageName: string,
	resolveOptions?: { paths?: string[] },
): Promise<CodePayload> {
	const require = createRequire(import.meta.url);
	// Resolve package.json rather than `main` so a malicious `main: '../..'`
	// can't escape the package root before our traversal check runs below.
	let pkgJsonPath: string;
	try {
		pkgJsonPath = require.resolve(`${packageName}/package.json`, resolveOptions);
	} catch (err) {
		throw new CliError(`Cannot resolve package '${packageName}' — install it or use codeDir (${err instanceof Error ? err.message : String(err)})`);
	}
	const pkgRoot = Path.dirname(pkgJsonPath);
	let pkg: { name?: string; main?: string };
	try {
		pkg = JSON.parse(await fs.readFile(pkgJsonPath, 'utf8')) as typeof pkg;
	} catch (err) {
		throw new CliError(`Cannot read package.json at ${pkgJsonPath}: ${err instanceof Error ? err.message : String(err)}`);
	}
	if (pkg.name !== packageName) {
		throw new CliError(`Package at ${pkgRoot} has name '${pkg.name ?? '<none>'}', expected '${packageName}'`);
	}
	const mainRel = pkg.main ?? 'index.js';
	const mainPath = Path.resolve(pkgRoot, mainRel);
	const relative = Path.relative(pkgRoot, mainPath);
	if (relative.startsWith('..') || Path.isAbsolute(relative)) {
		throw new CliError(`Package '${packageName}' main '${mainRel}' resolves outside package root`);
	}
	const ext = Path.extname(mainPath);
	if (ext !== '.js' && ext !== '.wasm') {
		throw new CliError(`Package '${packageName}' main '${mainRel}' must be .js or .wasm, got '${ext || '<no extension>'}'`);
	}
	let stat;
	try {
		stat = await fs.stat(mainPath);
	} catch {
		throw new CliError(`Package '${packageName}' main '${mainRel}' does not exist at ${mainPath}`);
	}
	if (!stat.isFile()) {
		throw new CliError(`Package '${packageName}' main '${mainRel}' is not a regular file`);
	}
	if (stat.size > MAX_MODULE_BYTES) {
		throw new CliError(`Package '${packageName}' main exceeds ${MAX_MODULE_BYTES} bytes (${stat.size})`);
	}

	const sourceDir = Path.dirname(mainPath);
	// Flat layout: main at package root. Scraping would include Gruntfile,
	// test/, examples/, grafana/, etc. Keep the original main-only behavior.
	if (Path.resolve(sourceDir) === Path.resolve(pkgRoot)) {
		const content = ext === '.wasm'
			? await fs.readFile(mainPath)
			: await fs.readFile(mainPath, 'utf8');
		return new Map<string, string | Uint8Array>([ [ 'main', content ] ]);
	}

	// Nested layout (e.g. src/, dist/): walk sourceDir so relative requires
	// inside main's siblings resolve. Entry gets renamed to module `main`.
	const entryNaturalName = Path.relative(sourceDir, mainPath).replace(/\.(js|wasm)$/, '').replace(/\\/g, '/');
	const candidates = [ ...Fn.filter(await fs.readdir(sourceDir, { recursive: true }), file => /\.(js|wasm)$/.test(file)) ];
	if (candidates.length > MAX_MODULE_FILES) {
		throw new CliError(`Too many module files in package '${packageName}' source dir (${candidates.length}; max ${MAX_MODULE_FILES})`);
	}
	const entries = new Map<string, string | Uint8Array>();
	let totalBytes = 0;
	await spread(8, candidates, async file => {
		const full = Path.join(sourceDir, file);
		const content = file.endsWith('.wasm')
			? await fs.readFile(full)
			: await fs.readFile(full, 'utf8');
		const size = typeof content === 'string' ? Buffer.byteLength(content, 'utf8') : content.byteLength;
		totalBytes += size;
		if (totalBytes > MAX_MODULE_BYTES) {
			throw new CliError(`Module payload exceeded ${MAX_MODULE_BYTES} bytes while reading package '${packageName}'`);
		}
		const naturalName = file.replace(/\.(js|wasm)$/, '').replace(/\\/g, '/');
		const moduleName = naturalName === entryNaturalName ? 'main' : naturalName;
		if (entries.has(moduleName)) {
			throw new CliError(`Duplicate module name ${moduleName} in package '${packageName}'`);
		}
		entries.set(moduleName, content);
	});
	return entries;
}

async function deleteUserRecords(db: Database, shard: ShardType, userId: string) {
	const providers = await User.findProvidersForUser(db, userId);
	await Promise.all(Object.entries(providers).flatMap(
		([ provider, providerId ]) => providerId === undefined
			? []
			: [ db.data.hdel(`usersByProvider/${provider}`, [ providerId ]) ],
	));
	const branches = await db.data.smembers(Code.branchManifestKey(userId));
	await Promise.all(Fn.map(branches, async branchName => {
		await Promise.all([
			db.data.del(Code.buffersKey(userId, branchName)),
			db.data.del(Code.stringsKey(userId, branchName)),
		]);
	}));
	await Promise.all([
		db.data.del(Code.branchManifestKey(userId)),
		db.data.del(`user/${userId}/provider`),
		db.data.del(User.infoKey(userId)),
		db.data.srem('users', [ userId ]),
		shard.data.vdel(`user/${userId}/memory`),
		shard.scratch.srem('activeUsers', [ userId ]),
		...Fn.map(Fn.range(kMaxMemorySegmentId), id => shard.data.vdel(`user/${userId}/segment${id}`)),
	]);
}

// Filter presence by the active-rooms set: a stale scratch entry would enqueue
// an intent against a deleted blob (loadRoom ENOENT).
async function queueUnspawnIntentsForUser(entry: ShardEntry, userId: string): Promise<string[]> {
	const [ presence, roomSet ] = await Promise.all([
		entry.shard.scratch.smembers(userToPresenceRoomsSetKey(userId)),
		entry.shard.data.smembers('rooms'),
	]);
	const rooms = presence.filter(roomName => roomSet.includes(roomName));
	await Promise.all(rooms.map(roomName => pushIntentsForRoomNextTick(entry.shard, roomName, userId, {
		local: { unspawn: [ [] ] },
		internal: true,
	})));
	return rooms;
}

function makeSystemHelpers(db: Database, getSandbox: () => Sandbox, entry: ShardEntry) {
	return {
		getTickDuration: () => tickSpeed,
		setTickDuration: async (ms: number) => {
			if (typeof ms !== 'number' || ms < 1) {
				throw new CliError('Invalid tick duration');
			}
			const content = await fs.readFile(configPath, 'utf8');
			const cfg = (jsYaml.load(content) ?? {}) as Partial<Record<string, Record<string, unknown>>>;
			const game = cfg.game ??= {};
			game.tickSpeed = ms;
			// tmp+rename so a mid-write crash can't corrupt the operator's config.
			const serialized = jsYaml.dump(cfg);
			const tmpPath = new URL(`.screepsrc.yaml.${process.pid}.tmp`, configPath);
			await fs.writeFile(tmpPath, serialized, 'utf8');
			await fs.rename(tmpPath, configPath);
			return `Tick duration set to ${ms}ms (takes effect next tick)`;
		},
		pauseSimulation: async () => {
			const pause = getSandbox().pause;
			// `acquiring` reserves the slot synchronously before the first await, so two
			// concurrent callers can't both pass the guard and leak a second mutex.
			if (pause.mutex !== undefined || pause.acquiring) return { result: 'Simulation is already paused', [ECHO]: true };
			pause.acquiring = true;
			let mutex: Mutex | undefined;
			try {
				mutex = await Mutex.connect('game', entry.shard.data, entry.shard.pubsub);
				await mutex.lock();
				// If the client disconnected during lock(), no one will call resumeSimulation —
				// unlock now so the main loop isn't stuck on an orphan owner.
				if (getSandbox().destroyed) {
					await mutex.unlock();
					await mutex.disconnect();
					return { result: 'Pause aborted: client disconnected', [ECHO]: true };
				}
				pause.mutex = mutex;
				pause.owner = getSandbox();
				const channel = await getServiceChannel(entry.shard).subscribe();
				pause.cleanup = channel;
				channel.listen(message => {
					if (message.type === 'shutdown') pause.release().catch(() => {});
				});
			} catch (err) {
				if (mutex !== undefined && pause.mutex !== mutex) {
					await mutex.disconnect().catch(() => {});
				}
				throw err;
			} finally {
				pause.acquiring = false;
			}
			return { result: 'Simulation paused', [ECHO]: true };
		},
		resumeSimulation: async () => {
			const pause = getSandbox().pause;
			if (pause.mutex === undefined) return { result: 'Simulation is not paused', [ECHO]: true };
			await pause.release();
			return { result: 'Simulation resumed', [ECHO]: true };
		},
		importWorld: async (opts?: { source?: string; empty?: boolean }) => {
			if (opts?.empty && opts.source !== undefined) {
				throw new CliError('empty and source are mutually exclusive');
			}
			// Pause drains workers before we flush scratch; without it, in-flight
			// messages dereference wiped keys and drop intents or crash.
			if (getSandbox().pause.mutex === undefined) {
				throw new CliError('Refused: call system.pauseSimulation() first, wait for workers to idle, then retry system.importWorld().');
			}
			const result = await withGameLock(getSandbox().pause, entry.shard, async () => {
				await entry.shard.scratch.flushdb();
				clearAllWorldCaches(getSandbox);
				if (opts?.empty) {
					await Promise.all([
						db.data.flushdb(),
						entry.shard.data.flushdb(),
					]);
					entry.shard.time = 0;
					await entry.shard.data.set('time', 0);
					await Promise.all([ db.save(), entry.shard.save() ]);
					clearAllWorldCaches(getSandbox);
					// No world invalidation: backend's reloadWorld would crash on the
					// missing terrain blob. The trailing shutdown re-inits services.
					return 'All data wiped. Run `npx xxscreeps import` (or restart with a seeded DB) before starting the server again.';
				}
				const { importWorld } = await import('xxscreeps/scripts/import.js');
				const count = await importWorld(db, entry.shard, { source: opts?.source });
				clearAllWorldCaches(getSandbox);
				await getInvalidationChannel(entry.shard).publish({ type: 'world' });
				return opts?.source === undefined
					? `All data wiped. Imported ${count} rooms from default world.`
					: `All data wiped. Imported ${count} rooms from ${opts.source}.`;
			});
			// Shut down cleanly rather than runtime-reinit every service's in-memory
			// state. setImmediate lets the response reach the client before exit.
			setImmediate(() => {
				void getServiceChannel(entry.shard).publish({ type: 'shutdown' });
			});
			return result;
		},
		sendServerMessage: async (message: string) => {
			if (typeof message !== 'string' || message === '') {
				throw new CliError('Invalid message');
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

function makeRoomHelpers(getSandbox: () => Sandbox, entry: ShardEntry) {
	return {
		list: () => entry.shard.data.smembers('rooms'),
		peek: async <Type>(name: string, task: (room: Room, game: typeof Game) => Type) => {
			const world = entry.worldCache ??= await entry.shard.loadWorld();
			const room = await entry.shard.loadRoom(name);
			return runOneShot(world, room, entry.shard.time, '0', () => task(room, Game));
		},
		poke: <Type>(name: string, userId: string, task: (room: Room, game: typeof Game) => Type) =>
			// Holds the game mutex so the processor can't advance shard.time mid-save
			// (which would trip checkTime on saveRoom).
			withGameLock(getSandbox().pause, entry.shard, async () => {
				const world = entry.worldCache ??= await entry.shard.loadWorld();
				const room = await entry.shard.loadRoom(name);
				const result = runOneShot(world, room, entry.shard.time, userId, () => task(room, Game));
				room['#flushObjects'](null);
				flushUsers(room);
				await entry.shard.saveRoom(room.name, entry.shard.time, room);
				// saveRoom only wrote the `time % 2` slot; copy forward so an
				// opposite-parity reader (sleeping rooms, paused sim) doesn't see
				// the pre-poke blob until the processor naturally catches up.
				await entry.shard.copyRoomFromPreviousTick(room.name, entry.shard.time + 1);
				// Evict the worker's cached Room, otherwise the first didUpdate
				// next tick overwrites both slots back to the pre-poke state.
				await getInvalidationChannel(entry.shard).publish({ type: 'room', roomName: room.name });
				return result;
			}),
	};
}

function shardsGroup(
	db: Database,
	getSandbox: () => Sandbox,
): CommandGroup {
	return {
		name: 'shards',
		description: 'Configured shard discovery and context',
		commands: [
			{
				name: 'list',
				description: 'List configured shard names',
				handler: () => config.shards.map(sh => sh.name),
			},
			{
				name: 'get',
				description: 'Open a shard context (name, time, data, pubsub, rooms, system)',
				args: [ { name: 'name', kind: 'string' } ],
				// Returned handles (data/pubsub) are live connections — only
				// callable from the REPL sandbox. One-shot admin mode gets a
				// useless inspect dump, so gate it off.
				interactiveOnly: true,
				handler: async (name: string) => {
					const shardEntries = getSandbox().shardEntries;
					let shardEntry = shardEntries.get(name);
					if (shardEntry === undefined) {
						shardEntry = { shard: await Shard.connect(db, name) };
						shardEntries.set(name, shardEntry);
					}
					return {
						name: shardEntry.shard.name,
						time: shardEntry.shard.time,
						data: shardEntry.shard.data,
						pubsub: shardEntry.shard.pubsub,
						rooms: makeRoomHelpers(getSandbox, shardEntry),
						system: makeSystemHelpers(db, getSandbox, shardEntry),
					};
				},
			},
			{
				name: 'info',
				description: 'Return a scriptable summary of a shard: name, current tick, and room count',
				args: [ { name: 'name', kind: 'string' } ],
				handler: async (name: string) => {
					const shardEntries = getSandbox().shardEntries;
					let shardEntry = shardEntries.get(name);
					if (shardEntry === undefined) {
						shardEntry = { shard: await Shard.connect(db, name) };
						shardEntries.set(name, shardEntry);
					}
					const rooms = await shardEntry.shard.data.smembers('rooms');
					return {
						name: shardEntry.shard.name,
						time: shardEntry.shard.time,
						rooms: rooms.length,
					};
				},
			},
		],
	};
}

function usersGroup(db: Database, getSandbox: () => Sandbox, entry: ShardEntry): CommandGroup {
	return {
		name: 'users',
		description: 'Look up and manage user records',
		commands: [
			{
				name: 'findByName',
				description: 'Look up a userId by username',
				args: [ { name: 'username', kind: 'string' } ],
				handler: (username: string) => User.findUserByName(db, username),
			},
			{
				name: 'info',
				description: 'Return the user info hash for a userId',
				args: [ { name: 'userId', kind: 'string' } ],
				handler: (userId: string) => db.data.hgetall(User.infoKey(userId)),
			},
			{
				name: 'list',
				description: 'List all users with ids and usernames',
				handler: async () => {
					const userIds = await db.data.smembers('users');
					return Promise.all(Fn.map(userIds, async userId => {
						const info = await db.data.hgetall(User.infoKey(userId));
						return { id: userId, username: info.username };
					}));
				},
			},
			{
				name: 'create',
				description: 'Create a new user with a generated id',
				args: [ { name: 'username', kind: 'string' } ],
				handler: async (username: string) => {
					if (!User.checkUsername(username)) {
						throw new CliError('Invalid username (3-20 alphanumeric chars, may include _ and -)');
					}
					const userId = generateId(12);
					// Legacy Screeps web client redirects signed-in users without `email`
					// to a "Verify E-mail" dead-end. RFC 2606's `.invalid` TLD keeps the
					// placeholder from ever matching a real address.
					const placeholderEmail = `${userId}@cli.invalid`;
					await User.create(db, userId, username, [ { provider: 'email', id: placeholderEmail } ]);
					return `User created: ${username} (${userId})`;
				},
			},
			{
				name: 'remove',
				description: 'Remove a user, clean their rooms, and delete all per-user records',
				destructive: true,
				args: [ { name: 'usernameOrId', kind: 'string' } ],
				handler: async (usernameOrId: string) => {
					const userId = await User.findUserByName(db, usernameOrId) ?? usernameOrId;
					const info = await db.data.hgetall(User.infoKey(userId));
					if (info.username === undefined) {
						throw new CliError(`User not found: ${usernameOrId}`);
					}
					// Lock keeps shard.time stable across intent push + record delete.
					return withGameLock(getSandbox().pause, entry.shard, async () => {
						let queued: string[] = [];
						try {
							queued = await queueUnspawnIntentsForUser(entry, userId);
						} finally {
							// Safe to delete synchronously — the unspawn intent only
							// references scratch keyed by userId, not user records.
							await deleteUserRecords(db, entry.shard, userId);
						}
						const roomSummary = queued.length > 0
							? `, queued unspawn for rooms: ${queued.join(', ')}`
							: '';
						return `Removed user: ${info.username} (${userId})${roomSummary}`;
					});
				},
			},
		],
	};
}

function botsGroup(db: Database, getSandbox: () => Sandbox, entry: ShardEntry): CommandGroup {
	return {
		name: 'bots',
		description: 'Place and manage bots (users with uploaded code)',
		commands: [
			{
				name: 'add',
				description: 'Create a user and place their spawn, uploading code in one step',
				example: 'xxscreeps admin bots add alice --room W5N5 --x 25 --y 25 --code-dir ./my-bot',
				args: [
					{ name: 'name', kind: 'string' },
					{
						name: 'opts',
						kind: 'object',
						shape: {
							room: { kind: 'string', required: true, description: 'Name of the room to claim' },
							x: { kind: 'number', required: true, description: 'Spawn x coordinate (0-49)' },
							y: { kind: 'number', required: true, description: 'Spawn y coordinate (0-49)' },
							modules: { kind: 'json', oneOf: 'code', description: 'Inline JSON map of module name → source' },
							codeDir: { kind: 'string', oneOf: 'code', description: 'Local directory to read .js/.wasm modules from' },
							package: { kind: 'string', oneOf: 'code', description: 'npm package name to load modules from' },
							packageRoot: { kind: 'string', description: 'Directory containing node_modules for --package lookup (e.g. a gitignored data/bots prefix); resolved against cwd. Requires --package' },
						},
					},
				],
				handler: async (name: string, opts?: { room: string; x: number; y: number; modules?: Record<string, string>; codeDir?: string; package?: string; packageRoot?: string }) => {
					if (!User.checkUsername(name)) {
						throw new CliError('Invalid username (3-20 alphanumeric chars, may include _ and -)');
					}
					if (opts === undefined || typeof opts.room !== 'string' || typeof opts.x !== 'number' || typeof opts.y !== 'number') {
						throw new CliError('Usage: bots.add(name, { room, x, y, modules|codeDir|package })');
					}
					if (opts.x < 0 || opts.x > 49 || opts.y < 0 || opts.y > 49) {
						throw new CliError(`Position ${opts.x},${opts.y} out of bounds (0-49)`);
					}
					const rooms = await entry.shard.data.smembers('rooms');
					if (!rooms.includes(opts.room)) {
						throw new CliError(`Room ${opts.room} does not exist`);
					}
					const modules = await resolveModules(opts);
					return withGameLock(getSandbox().pause, entry.shard, async () => {
						const userId = generateId(12);
						const world = entry.worldCache ??= await entry.shard.loadWorld();
						const terrain = world.map.getRoomTerrain(opts.room);
						if (terrain.get(opts.x, opts.y) === C.TERRAIN_MASK_WALL) {
							throw new CliError(`Position ${opts.x},${opts.y} in ${opts.room} is a natural wall`);
						}
						const room = await entry.shard.loadRoom(opts.room);
						const pos = new RoomPosition(opts.x, opts.y, opts.room);

						// In-memory eligibility check; mutations on this Room instance
						// are discarded. The real placement runs via the placeSpawn
						// intent below.
						const validationError = runOneShot(world, room, entry.shard.time, userId, (): string | undefined => {
							const controller = room.controller;
							if (!controller) return `Room ${opts.room} has no controller`;
							if (controller['#user'] !== null) return `Room ${opts.room} is already owned`;
							room['#user'] = userId;
							room['#level'] = 1;
							if (checkCreateConstructionSite(room, pos, 'spawn', 'Spawn1') !== C.OK) {
								return `Position ${opts.x},${opts.y} is invalid for spawn placement (check terrain and adjacency to exits)`;
							}
							return undefined;
						});
						if (validationError !== undefined) throw new CliError(validationError);

						// Roll the user back on any DB/scratch failure so a retry isn't
						// blocked by "Already associated".
						await User.create(db, userId, name);
						try {
							await Promise.all([
								Code.saveContent(db, userId, 'default', modules),
								pushIntentsForRoomNextTick(entry.shard, opts.room, userId, {
									local: { placeSpawn: [ [ opts.x, opts.y, 'Spawn1' ] ] },
									internal: true,
								}),
							]);
						} catch (err) {
							await deleteUserRecords(db, entry.shard, userId).catch(() => {});
							throw err;
						}
						return `Bot queued: ${name} (${userId}) — placeSpawn intent will land next tick in ${opts.room} at ${opts.x},${opts.y}`;
					});
				},
			},
			{
				name: 'reload',
				description: 'Re-upload bot code without changing ownership',
				example: 'xxscreeps admin bots reload alice --code-dir ./my-bot',
				args: [
					{ name: 'name', kind: 'string' },
					{
						name: 'opts',
						kind: 'object',
						shape: {
							modules: { kind: 'json', oneOf: 'code', description: 'Inline JSON map of module name → source' },
							codeDir: { kind: 'string', oneOf: 'code', description: 'Local directory to read .js/.wasm modules from' },
							package: { kind: 'string', oneOf: 'code', description: 'npm package name to load modules from' },
							packageRoot: { kind: 'string', description: 'Directory containing node_modules for --package lookup (e.g. a gitignored data/bots prefix); resolved against cwd. Requires --package' },
						},
					},
				],
				handler: async (name: string, opts?: { modules?: Record<string, string>; codeDir?: string; package?: string; packageRoot?: string }) => {
					if (opts === undefined || (opts.modules === undefined && opts.codeDir === undefined && opts.package === undefined)) {
						throw new CliError('Usage: bots.reload(name, { modules|codeDir|package })');
					}
					const userId = await User.findUserByName(db, name);
					if (userId === null) {
						throw new CliError(`User not found: ${name}`);
					}
					const modules = await resolveModules(opts);
					const info = await db.data.hgetall(User.infoKey(userId));
					const branch = info.branch ?? 'default';
					await Code.saveContent(db, userId, branch, modules);
					return `Code reloaded for ${name} (branch: ${branch}, ${modules.size} modules)`;
				},
			},
			{
				name: 'remove',
				description: 'Remove a bot, clean its rooms, and delete all per-user records',
				args: [ { name: 'name', kind: 'string' } ],
				handler: async (name: string) => {
					const userId = await User.findUserByName(db, name);
					if (userId === null) {
						throw new CliError(`User not found: ${name}`);
					}
					return withGameLock(getSandbox().pause, entry.shard, async () => {
						// deleteUserRecords in the finally so a failed intent enqueue
						// doesn't resurrect the user on the next tick.
						let queued: string[] = [];
						try {
							queued = await queueUnspawnIntentsForUser(entry, userId);
						} finally {
							await deleteUserRecords(db, entry.shard, userId);
						}
						const roomSummary = queued.length > 0
							? `, queued unspawn for rooms: ${queued.join(', ')}`
							: '';
						return `Removed bot: ${name} (${userId})${roomSummary}`;
					});
				},
			},
		],
	};
}

function mapGroup(getSandbox: () => Sandbox, entry: ShardEntry): CommandGroup {
	return {
		name: 'map',
		description: 'Active-room set and world terrain management',
		commands: [
			{
				name: 'openRoom',
				description: 'Add a room to the active rooms set (room must have a terrain entry)',
				args: [ { name: 'roomName', kind: 'string' } ],
				handler: async (roomName: string) => {
					if (typeof roomName !== 'string' || roomName === '') {
						throw new CliError('Usage: map.openRoom(roomName)');
					}
					// Guard against typos — an opened room with no terrain fails
					// loadRoom only later, when a bot tries to act on it.
					const world = entry.worldCache ??= await entry.shard.loadWorld();
					if (!world.terrain.has(roomName)) {
						throw new CliError(`Room ${roomName} has no terrain entry; import or generate terrain first`);
					}
					await entry.shard.data.sadd('rooms', [ roomName ]);
					clearAllWorldCaches(getSandbox);
					await getInvalidationChannel(entry.shard).publish({ type: 'accessibleRooms' });
					return `Opened room: ${roomName}`;
				},
			},
			{
				name: 'closeRoom',
				description: 'Remove a room from the active rooms set (data preserved)',
				args: [ { name: 'roomName', kind: 'string' } ],
				handler: async (roomName: string) => {
					if (typeof roomName !== 'string' || roomName === '') {
						throw new CliError('Usage: map.closeRoom(roomName)');
					}
					// Lock keeps shard.time stable across scratch read and
					// pushIntentsForRoomNextTick (which targets time+1).
					return withGameLock(getSandbox().pause, entry.shard, async () => {
						const rooms = await entry.shard.data.smembers('rooms');
						if (!rooms.includes(roomName)) {
							throw new CliError(`Room not found: ${roomName}`);
						}
						// Canonical cleanup (controller release, ruins, scratch) flows
						// through unspawn next tick; the room stays in sleepingRoomsKey
						// so the processor still saves the resulting blob.
						const room = await entry.shard.loadRoom(roomName);
						// Read `#users` directly — no public Room getter, and scanning
						// every user's presenceRooms scratch set would be O(users × rooms).
						const presencePlayers = room['#users'].presence.filter(uid => uid.length > 2);
						await Promise.all(presencePlayers.map(userId => pushIntentsForRoomNextTick(entry.shard, roomName, userId, {
							local: { unspawn: [ [] ] },
							internal: true,
						})));
						await entry.shard.data.srem('rooms', [ roomName ]);
						clearAllWorldCaches(getSandbox);
						await getInvalidationChannel(entry.shard).publish({ type: 'accessibleRooms' });
						const userSummary = presencePlayers.length > 0
							? `; queued unspawn for ${presencePlayers.length} user(s)`
							: '';
						return `Closed room: ${roomName}${userSummary}`;
					});
				},
			},
			{
				name: 'removeRoom',
				description: 'Close a room and delete its data (blobs + terrain entry)',
				args: [ { name: 'roomName', kind: 'string' } ],
				handler: async (roomName: string) => {
					if (typeof roomName !== 'string' || roomName === '') {
						throw new CliError('Usage: map.removeRoom(roomName)');
					}
					return withGameLock(getSandbox().pause, entry.shard, async () => {
						const rooms = await entry.shard.data.smembers('rooms');
						if (!rooms.includes(roomName)) {
							throw new CliError(`Room not found: ${roomName}`);
						}
						// Refuse presence-backed rooms: their inter-room intents from
						// adjacent bots hang the finalize loadRoom after vdel.
						const room = await entry.shard.loadRoom(roomName);
						const presencePlayers = [ ...new Set([
							...room['#users'].intents,
							...room['#users'].presence,
							...room['#users'].vision,
						]) ].filter(uid => uid.length > 2);
						if (presencePlayers.length > 0) {
							throw new CliError(`Room ${roomName} has ${presencePlayers.length} user(s) with presence; run bots.remove or map.closeRoom first`);
						}
						await Promise.all([
							entry.shard.scratch.zrem(activeRoomsKey, [ roomName ]),
							entry.shard.scratch.zrem(sleepingRoomsKey, [ roomName ]),
						]);
						await entry.shard.data.srem('rooms', [ roomName ]);
						// Drop the terrain entry too, or rooms.peek resurrects it via
						// a fresh loadWorld().
						const world = await entry.shard.loadWorld();
						const terrainModified = world.terrain.delete(roomName);
						await Promise.all([
							entry.shard.data.vdel(`room0/${roomName}`),
							entry.shard.data.vdel(`room1/${roomName}`),
							terrainModified ? entry.shard.data.set('terrain', writeTerrain(world.terrain), { retain: true }) : undefined,
						]);
						clearAllWorldCaches(getSandbox);
						// Evict worker caches; a terrain change forces a world reload
						// so adjacent-room pathfinding validators see the deletion.
						await getInvalidationChannel(entry.shard).publish({ type: 'room', roomName });
						if (terrainModified) {
							await getInvalidationChannel(entry.shard).publish({ type: 'world' });
						}
						return `Removed room: ${roomName}`;
					});
				},
			},
		],
	};
}

function roomsGroup(getSandbox: () => Sandbox, entry: ShardEntry): CommandGroup {
	const helpers = makeRoomHelpers(getSandbox, entry);
	return {
		name: 'rooms',
		description: 'Inspect or mutate room state with a Game-like context',
		commands: [
			{
				name: 'list',
				description: 'List all active room names',
				handler: helpers.list,
			},
			{
				name: 'peek',
				description: 'Read-only game context: task(room, Game) => result',
				args: [
					{ name: 'name', kind: 'string' },
					{ name: 'task', kind: 'callback', type: '(room, Game) => any' },
				],
				handler: helpers.peek,
			},
			{
				name: 'poke',
				description: 'Mutating game context; saves the room blob directly. WARNING: bypasses the processor pipeline — no intents, no inter-room dispatch, no pre/tick processors. Prefer a canonical intent for standard actions; use poke for state fixes and scripted edits that have no intent equivalent.',
				args: [
					{ name: 'name', kind: 'string' },
					{ name: 'userId', kind: 'string' },
					{ name: 'task', kind: 'callback', type: '(room, Game) => any' },
				],
				handler: helpers.poke,
			},
		],
	};
}

function systemGroup(db: Database, getSandbox: () => Sandbox, entry: ShardEntry): CommandGroup {
	const helpers = makeSystemHelpers(db, getSandbox, entry);
	return {
		name: 'system',
		description: 'Simulation and server-wide controls',
		commands: [
			{
				name: 'getTickDuration',
				description: 'Get the current tick speed in milliseconds',
				handler: helpers.getTickDuration,
			},
			{
				name: 'setTickDuration',
				description: 'Set the tick speed; takes effect next tick',
				args: [ { name: 'ms', kind: 'number' } ],
				handler: helpers.setTickDuration,
			},
			{
				name: 'pauseSimulation',
				description: 'Pause the game loop (held until resumeSimulation or disconnect)',
				interactiveOnly: true,
				handler: helpers.pauseSimulation,
			},
			{
				name: 'resumeSimulation',
				description: 'Resume the game loop',
				interactiveOnly: true,
				handler: helpers.resumeSimulation,
			},
			{
				name: 'importWorld',
				description: 'Wipe all data and import a world. Default: @screeps/launcher seed. Pass --source for a custom db.json or --empty to leave the world unimported (requires a subsequent `npx xxscreeps import` or `--source` re-run before the server can start again). Server exits after running; restart with `npx xxscreeps start`.',
				destructive: true,
				requiresPause: true,
				args: [ {
					name: 'opts',
					kind: 'object',
					optional: true,
					shape: {
						source: { kind: 'string', description: 'Path or URL to a world db.json dump. Defaults to @screeps/launcher.' },
						empty: { kind: 'boolean', description: 'Leave the world empty instead of importing. Mutually exclusive with source. Server cannot start again until terrain is imported.' },
					},
				} ],
				handler: helpers.importWorld,
			},
			{
				name: 'sendServerMessage',
				description: 'Broadcast a message to every connected user',
				args: [ { name: 'message', kind: 'string' } ],
				handler: helpers.sendServerMessage,
			},
		],
	};
}

hooks.register('sandbox', (db, shard) => ({
	db: db.data,
	shard: shard.data,
	storage: {
		db: db.data,
		shard: shard.data,
		scratch: shard.scratch,
		pubsub: shard.pubsub,
	},
	...C,
	RoomPosition,
}));

hooks.register('commands', (db, _shard, getSandbox, entry) => [
	shardsGroup(db, getSandbox),
	usersGroup(db, getSandbox, entry),
	botsGroup(db, getSandbox, entry),
	mapGroup(getSandbox, entry),
	roomsGroup(getSandbox, entry),
	systemGroup(db, getSandbox, entry),
]);
