import type { RoomObject } from 'xxscreeps/game/object';
import type { Structure } from 'xxscreeps/mods/structure/structure';

import Loki from 'lokijs';

import { RoomPosition } from 'xxscreeps/game/position';
import { TerrainWriter } from 'xxscreeps/game/terrain';
import * as Fn from 'xxscreeps/utility/functional';
import * as C from 'xxscreeps/game/constants';
import * as StoreLib from 'xxscreeps/mods/resource/store';

// Schemas
import * as CodeSchema from 'xxscreeps/engine/user/code';
import * as MapSchema from 'xxscreeps/game/map';
import * as Badge from 'xxscreeps/engine/user/badge';
import * as User from 'xxscreeps/engine/user/user';

import { Database } from 'xxscreeps/engine/database';
import { Shard } from 'xxscreeps/engine/shard';
import { makeWriter } from 'xxscreeps/schema/write';
import { saveMemoryBlob } from 'xxscreeps/mods/memory/model';
import { utf16ToBuffer } from 'xxscreeps/utility/string';
import { Room, flushUsers } from 'xxscreeps/game/room/room';

// Objects
import { Mineral } from 'xxscreeps/mods/mineral/mineral';
import { Source } from 'xxscreeps/mods/source/source';
import { StructureSpawn } from 'xxscreeps/mods/spawn/spawn';
import { StructureController } from 'xxscreeps/mods/controller/controller';
import { StructureKeeperLair } from 'xxscreeps/mods/source/keeper-lair';

const [ jsonSource ] = process.argv.slice(2) as (string | undefined)[];
if (jsonSource === undefined) {
	console.error(`Usage: ${process.argv[1]} db.json`);
	process.exit(1);
}

function withRoomObject(from: any, into: RoomObject) {
	into.id = from._id;
	into.pos = new RoomPosition(from.x, from.y, from.room);
}

function withStructure(from: any, into: Structure) {
	withRoomObject(from, into);
	into['#user'] = from.user ?? null;
}

function withStore(from: any, into: { store: StoreLib.Store }) {
	const capacity = from.storeCapacityResource === undefined ?
		from.storeCapacity :
		Fn.accumulate(Object.values<number>(from.storeCapacityResource));
	into.store = StoreLib.create(capacity, from.storeCapacityResource, from.store);
}

// Initialize import source
const loki = new Loki(jsonSource);
await new Promise<void>((resolve, reject) => {
	loki.loadDatabase({}, (err?: Error) => err ? reject(err) : resolve());
});
const env = loki.getCollection('env').findOne().data;
const gameTime: number = env.gameTime - 1;

// Initialize and connect to database & shard
const db = await Database.connect();
{
	// Flush databases at the same time because they may point to the same service
	const shard = await Shard.connect(db, 'shard0');
	await Promise.all([
		db.blob.flushdb(),
		db.data.flushdb(),
		shard.blob.flushdb(),
		shard.data.flushdb(),
	]);
	// Initialize blank database
	await shard.data.set('time', gameTime);
	await Promise.all([
		db.blob.save(),
		db.data.save(),
		shard.blob.save(),
		shard.data.save(),
	]);
	shard.disconnect();
}
const shard = await Shard.connect(db, 'shard0');
const { blob } = shard;

// Save terrain data
const roomsTerrain = new Map(loki.getCollection('rooms.terrain').find().map(({ room, terrain }) => {
	const writer = new TerrainWriter;
	for (let xx = 0; xx < 50; ++xx) {
		for (let yy = 0; yy < 50; ++yy) {
			// 3 == WALL + SWAMP.. turn that back into WALL
			const value = Number(terrain[yy * 50 + xx]);
			writer.set(xx, yy, value > 2 ? 1 : value);
		}
	}
	const checkExit = (fn: (ii: number) => [ number, number ]) =>
		Fn.some(Fn.range(1, 49), ii => writer.get(...fn(ii)) !== C.TERRAIN_MASK_WALL);
	const exits =
		(checkExit(ii => [ ii, 0 ]) ? 1 : 0) |
		(checkExit(ii => [ 49, ii ]) ? 2 : 0) |
		(checkExit(ii => [ ii, 49 ]) ? 4 : 0) |
		(checkExit(ii => [ 0, ii ]) ? 8 : 0);
	return [ room as string, {
		exits,
		terrain: writer,
	} ];
}));
await blob.set('terrain', makeWriter(MapSchema.schema)(roomsTerrain));

// Collect room data
const roomObjects = loki.getCollection('rooms.objects');
const rooms = loki.getCollection('rooms').find().map(room => {
	const objects = roomObjects.find({ room: room._id });
	const instance = new Room;
	instance.name = room._id;
	instance['#level'] = -1;
	instance['#objects'] = [ ...Fn.filter(objects.map(object => {
		switch (object.type) {
			case 'controller': {
				instance['#user'] = object.user ?? null;
				instance['#level'] = object.level ?? 0;
				instance['#safeModeUntil'] = object.safeMode;

				const controller = new StructureController;
				withStructure(object, controller);
				controller.isPowerEnabled = object.isPowerEnabled;
				controller.safeModeAvailable = object.safeModeAvailable;
				controller['#downgradeTime'] = object.downgradeTime;
				controller['#progress'] = object.progress;
				controller['#safeModeCooldownTime'] = object.safeModeCooldown;
				controller['#upgradeBlockedUntil'] = object.upgradeBlocked;
				return controller;
			}

			case 'keeperLair': {
				const keeperLair = new StructureKeeperLair;
				withStructure(object, keeperLair);
				keeperLair['#user'] = '3';
				return keeperLair;
			}

			case 'mineral': {
				const mineral = new Mineral;
				withRoomObject(object, mineral);
				mineral.density = object.density;
				mineral.mineralAmount = object.mineralAmount;
				mineral.mineralType = object.mineralType;
				return mineral;
			}

			case 'source': {
				const source = new Source;
				withRoomObject(object, source);
				source.energy = object.energy;
				source.energyCapacity = object.energyCapacity;
				source['#nextRegenerationTime'] = gameTime + (object.ticksToRegeneration as number);
				return source;
			}

			case 'spawn': {
				const spawn = new StructureSpawn;
				withStructure(object, spawn);
				withStore(object, spawn);
				spawn.name = object.name;
				return spawn;
			}
		}
	})) ];
	flushUsers(instance);
	return instance;
});

// Save rooms
const roomNames = new Set(Fn.map(rooms, room => room.name));
await shard.data.sadd('rooms', [ ...roomNames ]);
for (const room of rooms) {
	await shard.saveRoom(room.name, gameTime, room as never);
}

// Save users
const code = loki.getCollection('users.code');
const users = loki.getCollection('users');
const activeUserIds = new Set<string>();
for (const user of users.find()) {
	const branch = code.find({ user: user._id, activeWorld: true })[0]?.branch ?? '';
	const memory: string | undefined = env[`memory:${user.id}`];
	if (user.active && user.cpu > 0) {
		activeUserIds.add(user._id);
	}
	await User.create(db, user._id, user.username);
	if (user.badge) {
		await Badge.save(db, user._id, JSON.stringify(user.badge));
	}
	await db.data.hmset(User.infoKey(user._id), {
		branch,
		...user.registeredDate && {
			registeredDate: +new Date(user.registeredDate),
		},
	});
	if (memory !== undefined) {
		await saveMemoryBlob(shard, user._id, utf16ToBuffer(memory));
	}
}
await shard.data.sadd('users', [ ...activeUserIds ]);

// Save user code content
for (const branch of code.find()) {
	const modules = new Map(Object.entries(branch.modules).map(([ key, data ]) => {
		const name = key.replace(/\$DOT\$/g, '.').replace(/\$SLASH\$/g, '/').replace(/\$BACKSLASH\$/g, '\\');
		return [ name, data as string ];
	}));
	await CodeSchema.saveContent(db, branch.user, branch.branch, modules);
}

// Finish up
await db.save();
await shard.save();
db.disconnect();
shard.disconnect();
