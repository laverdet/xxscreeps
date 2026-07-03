// Ops tool for managing users and bots on a self-hosted xxscreeps server — connects to the
// configured storage provider directly, like scripts/scrape-world.ts. Registered as the `manage`
// subcommand; run after `tsc -b`: `xxscreeps manage <user|bot> <verb> ...` (usage() lists commands).
//
// The running engine caches state: list/show/create read storage per request, but a new user isn't
// processed until it owns an object in a room — `bot add --spawn` covers that by acquiring the game
// mutex and applying the same claim/spawn mutation the `placeSpawn` intent performs, in between ticks,
// so it works whether or not the server is running (a running server hands off the mutex between ticks).
// Code saves are picked up by the runner on the next tick via the code channel. `remove` deletes
// records only — owned room objects are left alone — and is safe for inactive users; pause the
// engine first if the user is live.

import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import { config } from 'xxscreeps/config/index.js';
import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { Mutex } from 'xxscreeps/engine/db/mutex.js';
import * as Badge from 'xxscreeps/engine/db/user/badge.js';
import * as Code from 'xxscreeps/engine/db/user/code.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { updateUserRoomRelationships, userToIntentRoomsSetKey } from 'xxscreeps/engine/processor/model.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { getServiceChannel } from 'xxscreeps/engine/service/index.js';
import { primitiveComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { nonNullPredicate } from 'xxscreeps/functional/predicate.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, GameState, runAsUser, runOneShot, runWithState } from 'xxscreeps/game/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { flushUsers } from 'xxscreeps/game/room/room.js';
import { setPassword } from 'xxscreeps/mods/backend/password/model.js';
import { checkCreateConstructionSite } from 'xxscreeps/mods/construction/room.js';
import * as ControllerProc from 'xxscreeps/mods/controller/processor.js';
import { deleteUserMemoryBlob, loadUserMemoryBlob } from 'xxscreeps/mods/memory/model.js';
import { create as createSpawn } from 'xxscreeps/mods/spawn/spawn.js';
import { createRuin } from 'xxscreeps/mods/structure/ruin.js';
import { OwnedStructure } from 'xxscreeps/mods/structure/structure.js';

import 'xxscreeps:mods/game';

await using db = await Database.connect();
await using shard = await Shard.connect(db, config.shards[0]!.name);

const out = (line: string) => process.stdout.write(`${line}\n`);
const save = () => Promise.all([ db.save(), shard.save() ]);

async function pauseTick(count: number) {
	const serviceChannel = getServiceChannel(shard);
	const target = shard.time + count;
	const tick = () => serviceChannel.publish({ type: 'pausedTick' });
	await tick();
	for await (const message of shard.channel.iterable()) {
		if (message.type === 'tick') {
			const { time } = message;
			out(`Tick ${time}.`);
			if (time === target) {
				break;
			}
			await tick();
		}
	}
}

// Accepts either a raw user id or a username.
async function resolveUserId(who: string) {
	if (await db.data.sIsMember('users', who)) {
		return who;
	}
	const byName = await User.findUserByName(db, who);
	if (byName !== null) {
		return byName;
	}
	throw new Error(`No such user: ${who}`);
}

async function userList() {
	const ids = await db.data.sMembers('users');
	if (ids.length === 0) {
		out('(no users)');
		return;
	}
	const idWidth = Math.max(...Fn.map(ids, id => id.length));
	const rows = await Fn.mapAwait(ids.sort(primitiveComparator), async id => {
		const info = await db.data.hmGet(User.infoKey(id), [ 'username', 'branch' ]);
		return `${id.padEnd(idWidth)}  ${(info.username ?? '?').padEnd(20)}  ${info.branch ?? '(none)'}`;
	});
	out(`${'id'.padEnd(idWidth)}  ${'username'.padEnd(20)}  branch`);
	for (const row of rows) {
		out(row);
	}
}

async function userShow(who: string) {
	const id = await resolveUserId(who);
	const [ info, providers, branches, memory ] = await Promise.all([
		db.data.hGetAll(User.infoKey(id)),
		User.findProvidersForUser(db, id),
		db.data.sMembers(Code.branchManifestKey(id)),
		loadUserMemoryBlob(shard, id),
	]);
	const providerList = Object.entries(providers).map(([ provider, value ]) => `${provider}=${value}`);
	out(`id            ${id}`);
	out(`username      ${info.username ?? '?'}`);
	out(`active branch ${info.branch ?? '(none)'}`);
	if (info.registeredDate !== undefined) {
		out(`registered    ${new Date(Number(info.registeredDate)).toISOString()}`);
	}
	out(`badge         ${info.badge === undefined ? 'none' : 'set'}`);
	out(`providers     ${providerList.length > 0 ? providerList.join(', ') : '(none)'}`);
	out(`code branches ${branches.length > 0 ? branches.join(', ') : '(none)'}`);
	out(`memory        ${memory === null ? 'none' : `${memory.length} bytes`}`);
}

async function userCreate(name: string, email?: string) {
	if (!User.checkUsername(name)) {
		throw new Error(`Invalid username: ${name}`);
	}
	const id = Id.generateId(12);
	await User.create(db, id, name, email === undefined ? [] : [ { provider: 'email', id: email } ]);
	await save();
	out(`Created user ${name} (${id}).`);
}

async function userRemove(who: string) {
	const id = await resolveUserId(who);
	await Promise.all([
		User.remove(db, id),
		deleteUserMemoryBlob(shard, id),
	]);
	await save();
	out(`Removed user ${who} (${id}).`);
}

// `source` is inline JSON or a path to a `.json` file holding a badge object (the same shape the
// `/api/user/badge` endpoint accepts). The standard 24 numbered badges are `{ color1, color2,
// color3, flip, param, type }`; see engine/db/user/badge.ts for the schema.
async function userBadge(who: string, source: string) {
	const id = await resolveUserId(who);
	const json = source.endsWith('.json') ? await fs.readFile(source, 'utf8') : source;
	const badge = Badge.validate(JSON.parse(json) as object);
	await Badge.save(db, id, JSON.stringify(badge));
	await save();
	out(`Set badge for ${who} (${id}).`);
}

// Operator password reset; there is no online path that sets a password without the old one. Only
// meaningful when the password backend mod is enabled. Mirrors its 8-character minimum.
async function userPassword(who: string, password: string) {
	if (password.length < 8) {
		throw new Error('Password must be at least 8 characters');
	}
	const id = await resolveUserId(who);
	await setPassword(db, id, password);
	await save();
	out(`Set password for ${who} (${id}).`);
}

// Switch the active code branch, mirroring `/api/user/set-active-branch`: persist then publish so a
// running runner reloads it next tick; a no-op publish on a stopped server.
async function userBranch(who: string, branch: string) {
	const id = await resolveUserId(who);
	if (!await db.data.sIsMember(Code.branchManifestKey(id), branch)) {
		const branches = await db.data.sMembers(Code.branchManifestKey(id));
		throw new Error(`No such branch: ${branch} (have: ${branches.length > 0 ? branches.join(', ') : 'none'})`);
	}
	await db.data.hSet(User.infoKey(id), 'branch', branch);
	await save();
	await Code.getUserCodeChannel(db, id).publish({ type: 'switch', branch });
	out(`Set active branch for ${who} (${id}) to '${branch}'.`);
}

// Modules are keyed by filename (`main.js`, ...) — the same shape the backend saves for players.
async function loadCodeDir(dir: string) {
	const names = await fs.readdir(dir);
	const entries = await Fn.mapAwait(names, async name => {
		const path = nodePath.join(dir, name);
		if (!(await fs.stat(path)).isFile()) {
			// Bots are a flat module map; a nested build tree would load partially and fail
			// cryptically in the sandbox, so surface what's dropped instead of skipping silently.
			process.stderr.write(`Warning: skipping non-file '${name}'; subdirectories are not loaded.\n`);
			return undefined;
		}
		// `.wasm` modules are binary; reading them as utf8 corrupts the bytes. Store the raw bytes
		// and key a required wasm module without the extension — `require('foo')` resolves `foo`,
		// never `foo.wasm` — matching the upload format real bots use. The `main.wasm` WASI entry
		// keeps its name so the runtime's entry detection still finds it.
		const wasm = nodePath.extname(name) === '.wasm';
		const content: string | Uint8Array = wasm ? await fs.readFile(path) : await fs.readFile(path, 'utf8');
		const key = wasm && name !== 'main.wasm' ? nodePath.basename(name, '.wasm') : name;
		return [ key, content ] as const;
	});
	const modules: Code.CodePayload = new Map(Fn.filter(entries, nonNullPredicate));
	if (modules.size === 0) {
		throw new Error(`No code files in ${dir}`);
	}
	if (![ 'main.js', 'main', 'main.mjs', 'main.wasm' ].some(name => modules.has(name))) {
		process.stderr.write(`Warning: no main module in ${dir}; the bot has no entry point.\n`);
	}
	return modules;
}

// Shared by `bot add` and `bot update`. Code loads before any database write so a bad directory
// can't leave a half-registered user.
async function botSave(who: string, dir: string, branchArg: string | undefined, create: boolean) {
	const modules = await loadCodeDir(dir);
	const id = await async function() {
		if (create) {
			if (!User.checkUsername(who)) {
				throw new Error(`Invalid username: ${who}`);
			}
			const existing = await User.findUserByName(db, who);
			if (existing !== null) {
				process.stderr.write(`User ${who} already exists (${existing}); updating its code.\n`);
				return existing;
			}
			const id = Id.generateId(12);
			await User.create(db, id, who);
			// A new bot has no badge and renders blank on the map; assign a random one, as the
			// vanilla bot CLI does. Existing users keep theirs.
			await Badge.save(db, id, JSON.stringify(Badge.generateRandom()));
			return id;
		}
		return resolveUserId(who);
	}();
	const branch = branchArg ?? await db.data.hGet(User.infoKey(id), 'branch') ?? 'default';
	await Code.saveContent(db, id, branch, modules);
	await save();
	out(`Saved ${modules.size} module(s) to ${who} (${id}) branch '${branch}'.`);
	return id;
}

async function botSpawn(userId: string, roomName: string, coords?: string) {
	const position = function() {
		if (coords === undefined) {
			return undefined;
		}
		const [ xx = NaN, yy = NaN ] = coords.split(',').map(Number);
		return new RoomPosition(xx, yy, roomName);
	}();

	// Hold the game mutex so no tick runs while we mutate the room. A running server releases it
	// between ticks; with no server it's uncontended and acquired immediately.
	await using gameMutex = await Mutex.connect('game', shard.data, shard.pubsub);
	await using lock = await gameMutex.acquire();

	// Authoritative under the lock: the previous tick committed `time` before releasing the mutex,
	// and no tick can start while we hold it.
	const time = Number(await shard.data.get('time'));
	const [ intentRooms, world ] = await Promise.all([
		shard.scratch.sMembers(userToIntentRoomsSetKey(userId)),
		shard.loadWorld(),
	]);
	if (intentRooms.length !== 0) {
		throw new Error(`User has presence in: ${intentRooms.join(', ')}`);
	}

	// Validate the position (and pick a random one) against an owned copy of the room; this room is
	// discarded — `runOneShot` mutates only in memory, nothing here is persisted.
	const validateRoom = await shard.loadRoom(roomName, time);
	const spawnPos = runOneShot(world, validateRoom, time, userId, () => {
		if (!validateRoom.controller) {
			throw new Error(`No controller in ${roomName}`);
		}
		if (validateRoom.controller.reservation || validateRoom.controller.owner) {
			throw new Error(`Room is owned: ${roomName}`);
		}
		validateRoom['#user'] = validateRoom.controller['#user'] = userId;
		validateRoom['#level'] = 1;
		if (position) {
			if (checkCreateConstructionSite(validateRoom, position, 'spawn', 'Spawn1') !== C.OK) {
				throw new Error(`Invalid spawn position: ${position.x},${position.y}`);
			}
			return position;
		}
		const random = () => 3 + Math.floor(Math.random() * 46);
		const found = Fn.find(
			Fn.map(Fn.range(1000), () => new RoomPosition(random(), random(), roomName)),
			pos => checkCreateConstructionSite(validateRoom, pos, 'spawn', 'Spawn1') === C.OK);
		if (!found) {
			throw new Error(`No valid spawn position found in ${roomName}`);
		}
		return found;
	});

	// Apply the spawn directly on a fresh, still-unowned room — the same mutation the `placeSpawn`
	// intent performs (drop neutral objects, claim the controller, insert the spawn), but without the
	// processor. `claim` queues its scratch writes through a minimal context we drain afterwards.
	const room = await shard.loadRoom(roomName, time);
	const state = new GameState(world, time + 1, [ room ]);
	const tasks: Promise<unknown>[] = [];
	const context = {
		shard,
		state,
		didUpdate() {},
		setActive() {},
		wakeAt() {},
		sendRoomIntent() {},
		task(task: Promise<unknown>) {
			tasks.push(task);
		},
	};
	runWithState(state, () => runAsUser(userId, () => {
		for (const object of room['#objects']) {
			if (object['#user'] === null) {
				if (object.hits !== undefined) {
					room['#removeObject'](object);
				}
			} else if (object instanceof OwnedStructure) {
				room['#insertObject'](createRuin(object, 100000));
				room['#removeObject'](object);
			} else {
				room['#removeObject'](object);
			}
		}
		ControllerProc.claim(context, room.controller!, userId);
		room['#insertObject'](createSpawn(spawnPos, userId, 'Spawn1'));
		room['#cumulativeEnergyHarvested'] = 0;
		room['#safeModeUntil'] = Game.time + C.SAFE_MODE_DURATION;
		room['#flushObjects'](state);
	}));
	await Promise.all(tasks);

	// Persist both double-buffer slots so the room reads correctly whichever tick first processes it,
	// and register the user/room relationship so the server keeps the room active.
	const previousUsers = flushUsers(room);
	await Promise.all([
		updateUserRoomRelationships(shard, room, previousUsers),
		shard.saveRoom(roomName, time, room),
		shard.saveRoom(roomName, time + 1, room),
	]);
	await save();
	out(`Placed spawn at ${spawnPos.x},${spawnPos.y} in ${roomName} (tick ${time}).`);
}

function usage(): never {
	process.stderr.write(`Usage:
	game pause
	game pause-tick [count]
	game unpause
  user list
  user show     <name|id>
  user create   <name> [email]
  user remove   <name|id>
  user badge    <name|id> <json|file>
  user password <name|id> <password>
  user branch   <name|id> <branch>
  bot  add    <name> <codeDir> [branch] [--spawn <room> [x,y]]
  bot  update <name|id> <codeDir> [branch]
  bot  remove <name|id>
`);
	process.exit(2);
}

const [ noun, verb, ...rest ] = process.argv.slice(2);
try {
	switch (`${noun} ${verb}`) {
		case 'game pause': await getServiceChannel(shard).publish({ type: 'pause' }); break;
		case 'game pause-tick': {
			const count = rest[0] === undefined ? 1 : Number(rest[0]);
			if (!Number.isInteger(count) || count < 1) usage();
			await pauseTick(count);
			break;
		}
		case 'game unpause': await getServiceChannel(shard).publish({ type: 'unpause' }); break;
		case 'user list': await userList(); break;
		case 'user show': if (rest[0] === undefined) usage(); await userShow(rest[0]); break;
		case 'user create': if (rest[0] === undefined) usage(); await userCreate(rest[0], rest[1]); break;
		case 'user remove': if (rest[0] === undefined) usage(); await userRemove(rest[0]); break;
		case 'user badge': if (rest[0] === undefined || rest[1] === undefined) usage(); await userBadge(rest[0], rest[1]); break;
		case 'user password': if (rest[0] === undefined || rest[1] === undefined) usage(); await userPassword(rest[0], rest[1]); break;
		case 'user branch': if (rest[0] === undefined || rest[1] === undefined) usage(); await userBranch(rest[0], rest[1]); break;
		case 'bot add': {
			const spawnIndex = rest.indexOf('--spawn');
			const args = spawnIndex === -1 ? rest : rest.slice(0, spawnIndex);
			const spawnArgs = spawnIndex === -1 ? undefined : rest.slice(spawnIndex + 1);
			if (args[0] === undefined || args[1] === undefined) usage();
			const userId = await botSave(args[0], args[1], args[2], true);
			if (spawnArgs !== undefined) {
				if (spawnArgs[0] === undefined) usage();
				await botSpawn(userId, spawnArgs[0], spawnArgs[1]);
			}
			break;
		}
		case 'bot update': if (rest[0] === undefined || rest[1] === undefined) usage(); await botSave(rest[0], rest[1], rest[2], false); break;
		case 'bot remove': if (rest[0] === undefined) usage(); await userRemove(rest[0]); break;
		default: usage();
	}
} catch (err) {
	process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
	process.exitCode = 1;
}
