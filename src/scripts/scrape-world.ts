import Loki from 'lokijs';

import { RoomPosition } from 'xxscreeps/game/position';
import { TerrainWriter } from 'xxscreeps/game/terrain';
import * as Fn from 'xxscreeps/utility/functional';
import * as C from 'xxscreeps/game/constants';
import * as Store from 'xxscreeps/mods/resource/store';

// Schemas
import * as CodeSchema from 'xxscreeps/engine/user/code';
import * as MapSchema from 'xxscreeps/game/map';
import * as Badge from 'xxscreeps/engine/user/badge';
import * as User from 'xxscreeps/engine/user/user';

import { Database } from 'xxscreeps/engine/database';
import { Shard } from 'xxscreeps/engine/shard';
import { Variant } from 'xxscreeps/schema/format';
import { makeWriter } from 'xxscreeps/schema/write';
import { clamp } from 'xxscreeps/utility/utility';
import { saveMemoryBlob } from 'xxscreeps/mods/memory/model';
import { utf16ToBuffer } from 'xxscreeps/utility/string';

const [ jsonSource ] = process.argv.slice(2) as (string | undefined)[];
if (jsonSource === undefined) {
	console.error(`Usage: ${process.argv[1]} db.json`);
	process.exit(1);
}

function withRoomObject(object: any) {
	return {
		id: object._id,
		pos: new RoomPosition(object.x, object.y, object.room),
		[Variant]: object.type,
		effects: undefined,
	};
}

function withStructure(object: any) {
	return {
		...withRoomObject(object),
		'#user': object.user ?? null,
		hits: 0,
	};
}

function withStore(object: any) {
	const capacity = object.storeCapacityResource === undefined ?
		object.storeCapacity :
		Fn.accumulate(Object.values<number>(object.storeCapacityResource));
	return {
		store: Store.create(capacity, object.storeCapacityResource, object.store),
	};
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
			writer.set(xx, yy, clamp(0, 2, Number(terrain[yy * 50 + xx])));
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
	const controller = objects.filter(object => object.type === 'controller')[0];
	return {
		name: room._id,
		'#eventLog': [],
		'#npcData': {
			users: new Set<string>(),
			memory: new Map,
		},
		'#user': controller?.user ?? null,
		'#level': controller?.level ?? 0,
		'#objects': [ ...Fn.filter(objects.map(object => {
			switch (object.type) {
				case 'controller':
					return {
						...withStructure(object),
						isPowerEnabled: object.isPowerEnabled,
						level: object.level,
						safeMode: object.safeMode,
						safeModeAvailable: object.safeModeAvailable,
						safeModeCooldown: object.safeModeCooldown,
						'#downgradeTime': object.downgradeTime,
						'#progress': object.progress,
						'#upgradeBlockedUntil': object.upgradeBlocked,
					};

				case 'mineral':
					return {
						...withRoomObject(object),
						density: object.density,
						mineralAmount: object.mineralAmount,
						mineralType: object.mineralType,
					};

				case 'source':
					return {
						...withRoomObject(object),
						energy: object.energy,
						energyCapacity: object.energyCapacity,
						'#nextRegenerationTime': gameTime + (object.ticksToRegeneration as number),
					};

				case 'spawn':
					return {
						...withStructure(object),
						...withStore(object),
						name: object.name,
					};
			}
		})) ],
	};
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
