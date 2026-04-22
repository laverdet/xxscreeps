import type { Database, Shard } from 'xxscreeps/engine/db/index.js';
import type { RoomObject } from 'xxscreeps/game/object.js';
import type { ResourceType } from 'xxscreeps/mods/resource/index.js';
import type { Store } from 'xxscreeps/mods/resource/store.js';
import type { Structure } from 'xxscreeps/mods/structure/structure.js';

import fs from 'node:fs/promises';
import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import Loki from 'lokijs';

import * as Badge from 'xxscreeps/engine/db/user/badge.js';
import * as CodeSchema from 'xxscreeps/engine/db/user/code.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import * as MapSchema from 'xxscreeps/game/map.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { Room, flushUsers } from 'xxscreeps/game/room/room.js';
import { TerrainWriter, packExits } from 'xxscreeps/game/terrain.js';
import { StructureController } from 'xxscreeps/mods/controller/controller.js';
import { Creep } from 'xxscreeps/mods/creep/creep.js';
import { StructureRampart } from 'xxscreeps/mods/defense/rampart.js';
import { StructureWall } from 'xxscreeps/mods/defense/wall.js';
import { saveMemoryBlob } from 'xxscreeps/mods/memory/model.js';
import { StructureExtractor } from 'xxscreeps/mods/mineral/extractor.js';
import { Mineral } from 'xxscreeps/mods/mineral/mineral.js';
import { OpenStore, SingleStore } from 'xxscreeps/mods/resource/store.js';
import { StructureRoad } from 'xxscreeps/mods/road/road.js';
import { StructureKeeperLair } from 'xxscreeps/mods/source/keeper-lair.js';
import { Source } from 'xxscreeps/mods/source/source.js';
import { StructureExtension } from 'xxscreeps/mods/spawn/extension.js';
import { StructureSpawn } from 'xxscreeps/mods/spawn/spawn.js';
import { makeWriter } from 'xxscreeps/schema/write.js';
import { spread } from 'xxscreeps/utility/async.js';
import { utf16ToBuffer } from 'xxscreeps/utility/string.js';

// @screeps/launcher's init_dist/db.json seeds a placeholder admin user with
// this fixed id; remap to the conventional id '1' so the default admin matches
// what the rest of the engine expects.
const LAUNCHER_ADMIN_USER_ID = 'f4b532d08c3952a';

function forUser(userId: string | null) {
	return userId === LAUNCHER_ADMIN_USER_ID ? '1' : userId;
}

// Union of every `rooms.objects` field — the loader switches on `type` to
// narrow. Optional across the board to avoid per-type interfaces.
interface RawObject {
	_id: string;
	room: string;
	type: string;
	x: number;
	y: number;
	user?: string | null;
	hits?: number;
	store?: Record<string, number>;
	storeCapacity?: number;
	storeCapacityResource?: { energy: number };
	level?: number;
	safeMode?: number;
	isPowerEnabled?: boolean;
	safeModeAvailable?: number;
	downgradeTime?: number;
	progress?: number;
	safeModeCooldown?: number;
	upgradeBlocked?: number;
	body?: { type: string; hits: number; boost?: string }[];
	ageTime?: number;
	name?: string;
	density?: number;
	mineralAmount?: number;
	mineralType?: string;
	isPublic?: boolean;
	nextDecayTime?: number;
	energy?: number;
	energyCapacity?: number;
	ticksToRegeneration?: number;
}

interface RawRoom { _id: string }
interface RawTerrain { room: string; terrain: string }
interface RawUser {
	_id: string;
	username: string;
	badge?: unknown;
	registeredDate?: string | number;
}
interface RawCode {
	user: string;
	branch: string;
	activeWorld?: boolean;
	modules: Record<string, string>;
}
interface RawEnv {
	[memoryKey: `memory:${string}`]: string | undefined;
	gameTime: number;
}

function withRoomObject(from: RawObject, into: RoomObject) {
	into.id = from._id;
	into.pos = new RoomPosition(from.x, from.y, from.room);
	if (from.user !== undefined) {
		into['#user'] = forUser(from.user ?? null);
	}
}

function withStructure(from: RawObject, into: Structure) {
	withRoomObject(from, into);
	if (from.hits !== undefined) {
		into.hits = from.hits;
	}
}

function withStore(from: RawObject, into: { store: Store }) {
	if (from.store === undefined) return;
	for (const [ type, amount ] of Object.entries(from.store)) {
		into.store['#add'](type as ResourceType, amount);
	}
}

export interface ImportOptions {
	/** Path to a Loki db.json file. Defaults to @screeps/launcher's init_dist/db.json */
	source?: string | undefined;
	/** Skip user/code import, only import terrain and rooms */
	shardOnly?: boolean | undefined;
}

async function resolveJsonSource(source: string | undefined): Promise<string> {
	if (source === undefined) {
		return fileURLToPath(new URL('../init_dist/db.json', import.meta.resolve('@screeps/launcher')));
	}
	if (typeof source !== 'string') {
		throw new Error('importWorld: source must be a string path');
	}
	const resolved = Path.resolve(source);
	if (!resolved.toLowerCase().endsWith('.json')) {
		throw new Error(`importWorld: source must be a .json file (got ${resolved})`);
	}
	try {
		await fs.stat(resolved);
	} catch {
		throw new Error(`importWorld: source file not found or unreadable: ${resolved}`);
	}
	return resolved;
}

/**
 * Import world data from a Loki db.json file into the given database and shard.
 * Returns the number of rooms imported.
 */
export async function importWorld(db: Database, shard: Shard, options?: ImportOptions): Promise<number> {
	const jsonSource = await resolveJsonSource(options?.source);
	const shardOnly = options?.shardOnly ?? false;

	const loki = new Loki(jsonSource);
	await new Promise<void>((resolve, reject) => {
		loki.loadDatabase({}, (err?: Error) => err ? reject(err) : resolve());
	});
	const env = loki.getCollection<{ data: RawEnv }>('env').findOne()?.data;
	if (env === undefined || typeof env.gameTime !== 'number') {
		throw new Error(`importWorld: malformed dump at ${jsonSource} — missing or invalid 'env' collection`);
	}
	const gameTime = env.gameTime - 1;

	// importWorld replaces the world, it doesn't merge. Without this, re-importing
	// on a populated DB produces duplicate rooms/users.
	await Promise.all([
		shardOnly ? undefined : db.data.flushdb(),
		shard.data.flushdb(),
	]);

	shard.time = gameTime;
	await shard.data.set('time', gameTime);

	const roomsTerrain = new Map(loki.getCollection<RawTerrain>('rooms.terrain').find().map(({ room, terrain }) => {
		const writer = new TerrainWriter();
		for (let xx = 0; xx < 50; ++xx) {
			for (let yy = 0; yy < 50; ++yy) {
				const value = Number(terrain[yy * 50 + xx]);
				writer.set(xx, yy, value > 2 ? 1 : value);
			}
		}
		return [ room, {
			exits: packExits(writer),
			terrain: writer,
		} ];
	}));
	await shard.data.set('terrain', makeWriter(MapSchema.schema)(roomsTerrain));

	const roomObjects = loki.getCollection<RawObject>('rooms.objects');
	const rooms = loki.getCollection<RawRoom>('rooms').find().map(room => {
		const objects = roomObjects.find({ room: room._id });
		const instance = new Room();
		instance.name = room._id;
		instance['#level'] = -1;
		instance['#objects'] = [ ...Fn.filter(objects.map(object => {
			switch (object.type) {
				case 'constructedWall': {
					const wall = new StructureWall();
					withStructure(object, wall);
					return wall;
				}

				case 'controller': {
					instance['#level'] = object.level ?? 0;
					instance['#safeModeUntil'] = object.safeMode ?? 0;
					instance['#user'] = forUser(object.user ?? null);

					const controller = new StructureController();
					withStructure(object, controller);
					controller.isPowerEnabled = object.isPowerEnabled ?? false;
					controller.safeModeAvailable = object.safeModeAvailable ?? 0;
					controller['#downgradeTime'] = object.downgradeTime ?? 0;
					controller['#progress'] = object.progress ?? 0;
					controller['#safeModeCooldownTime'] = object.safeModeCooldown ?? 0;
					controller['#upgradeBlockedUntil'] = object.upgradeBlocked ?? 0;
					return controller;
				}

				case 'creep': {
					const creep = new Creep();
					withRoomObject(object, creep);
					creep.store = OpenStore['#create'](object.storeCapacity ?? 0);
					withStore(object, creep);
					creep.body = object.body as typeof creep.body;
					creep.hits = object.hits ?? 0;
					creep.name = object.name ?? '';
					creep['#ageTime'] = object.ageTime ?? 0;
					return creep;
				}

				case 'extension': {
					const extension = new StructureExtension();
					withStructure(object, extension);
					extension.store = SingleStore['#create'](C.RESOURCE_ENERGY, object.storeCapacityResource?.energy ?? 0);
					withStore(object, extension);
					return extension;
				}

				case 'extractor': {
					const extractor = new StructureExtractor();
					withStructure(object, extractor);
					return extractor;
				}

				case 'keeperLair': {
					const keeperLair = new StructureKeeperLair();
					withStructure(object, keeperLair);
					keeperLair['#user'] = '3';
					return keeperLair;
				}

				case 'mineral': {
					const mineral = new Mineral();
					withRoomObject(object, mineral);
					mineral.density = object.density ?? 0;
					mineral.mineralAmount = object.mineralAmount ?? 0;
					mineral.mineralType = object.mineralType as ResourceType;
					return mineral;
				}

				case 'rampart': {
					const rampart = new StructureRampart();
					withStructure(object, rampart);
					rampart.isPublic = object.isPublic ?? false;
					rampart['#nextDecayTime'] = object.nextDecayTime ?? 0;
					return rampart;
				}

				case 'road': {
					const road = new StructureRoad();
					withStructure(object, road);
					road['#terrain'] = roomsTerrain.get(road.pos.roomName)!.terrain.get(road.pos.x, road.pos.y);
					road['#nextDecayTime'] = object.nextDecayTime ?? 0;
					return road;
				}

				case 'source': {
					const source = new Source();
					withRoomObject(object, source);
					source.energy = object.energy ?? 0;
					source.energyCapacity = object.energyCapacity ?? 0;
					source['#nextRegenerationTime'] = gameTime + (object.ticksToRegeneration ?? 0);
					return source;
				}

				case 'spawn': {
					const spawn = new StructureSpawn();
					withStructure(object, spawn);
					spawn.store = SingleStore['#create'](C.RESOURCE_ENERGY, object.storeCapacityResource?.energy ?? 0);
					withStore(object, spawn);
					spawn.name = object.name ?? '';
					return spawn;
				}
			}
		})) ];
		flushUsers(instance);
		return instance;
	});

	const roomNames = new Set(Fn.map(rooms, room => room.name));
	await shard.data.sadd('rooms', [ ...roomNames ]);
	await spread(32, rooms, async room => {
		await shard.saveRoom(room.name, gameTime, room as never);
	});
	// Copy each saved blob forward one tick so both double-buffer slots exist.
	// Without this, a read at gameTime+1 (out-of-queue processor tick, external
	// shard.time advance) hits "roomN/<room> does not exist". Live servers reach
	// this steady state via per-room copy-forwards in RoomProcessor.finalize.
	await spread(32, [ ...roomNames ], async roomName => {
		await shard.copyRoomFromPreviousTick(roomName, gameTime + 1);
	});

	if (!shardOnly) {
		const code = loki.getCollection<RawCode>('users.code');
		const users = loki.getCollection<RawUser>('users');
		await spread(32, users.find(), async user => {
			const id = forUser(user._id)!;
			const branch = code.find({ user: id, activeWorld: true })[0]?.branch ?? '';
			const memory = env[`memory:${id}`];
			// User.create first — later writes address `user/${id}` and may depend on it
			await User.create(db, id, user.username);
			await Promise.all([
				user.badge === undefined ? undefined : Badge.save(db, id, JSON.stringify(user.badge)),
				db.data.hmset(User.infoKey(id), {
					branch,
					...user.registeredDate === undefined ? {} : {
						registeredDate: +new Date(user.registeredDate),
					},
				}),
				typeof memory === 'string' ? saveMemoryBlob(shard, id, utf16ToBuffer(memory)) : undefined,
			]);
		});

		await spread(32, code.find(), async branch => {
			const modules = new Map(Object.entries(branch.modules).map(([ key, data ]) => {
				const name = key.replace(/\$DOT\$/g, '.').replace(/\$SLASH\$/g, '/').replace(/\$BACKSLASH\$/g, '\\');
				return [ name, data ];
			}));
			await CodeSchema.saveContent(db, forUser(branch.user)!, branch.branch, modules);
		});
	}

	// Persist to disk so an import survives a crash before the next save tick
	await Promise.all([
		shardOnly ? undefined : db.save(),
		shard.save(),
	]);

	return roomNames.size;
}
