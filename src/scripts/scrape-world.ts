import Loki from 'lokijs';

import { RoomPosition } from 'xxscreeps/game/position';
import { Owner } from 'xxscreeps/game/object';
import { TerrainWriter } from 'xxscreeps/game/terrain';
import * as Fn from 'xxscreeps/utility/functional';
import * as C from 'xxscreeps/game/constants';
import * as Store from 'xxscreeps/mods/resource/store';
import config from 'xxscreeps/config';

// Schemas
import * as Auth from 'xxscreeps/backend/auth/model';
import * as CodeSchema from 'xxscreeps/engine/metadata/code';
import * as MapSchema from 'xxscreeps/game/map';
import * as User from 'xxscreeps/engine/metadata/user';

import { Variant } from 'xxscreeps/schema/format';
import { makeWriter } from 'xxscreeps/schema/write';
import { Shard } from 'xxscreeps/engine/model/shard';
import { Objects } from 'xxscreeps/game/room/symbols';
import { connectToProvider } from 'xxscreeps/engine/storage';
import { EventLog } from 'xxscreeps/game/room';
import { NPCData } from 'xxscreeps/mods/npc/game';
import { clamp, getOrSet } from 'xxscreeps/utility/utility';
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
		[Owner]: object.user ?? null,
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

// Load JSON data and connect to blob storage
const db = new Loki(jsonSource);
await new Promise<void>((resolve, reject) => {
	db.loadDatabase({}, (err?: Error) => err ? reject(err) : resolve());
});

// Collect env data
const env = db.getCollection('env').findOne().data;
const gameTime: number = env.gameTime - 1;

// Collect room data
const roomObjects = db.getCollection('rooms.objects');
const rooms = db.getCollection('rooms').find().map(room => ({
	name: room._id,
	[NPCData]: {
		users: new Set<string>(),
		memory: new Map,
	},
	[Objects]: [ ...Fn.filter(roomObjects.find({ room: room._id }).map(object => {
		switch (object.type) {
			case 'controller':
				return {
					...withStructure(object),

					isPowerEnabled: object.isPowerEnabled,
					level: object.level,
					safeMode: object.safeMode,
					safeModeAvailable: object.safeModeAvailable,
					safeModeCooldown: object.safeModeCooldown,
					_downgradeTime: object.downgradeTime,
					_progress: object.progress,
					_upgradeBlockedTime: object.upgradeBlocked,
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
					_nextRegenerationTime: gameTime + (object.ticksToRegeneration as number),
				};

			case 'spawn':
				return {
					...withStructure(object),
					...withStore(object),
					name: object.name,
				};
		}
	})) ],
	[EventLog]: [],
}));

// Get visible rooms for users
const roomsControlled = new Map<string, Set<string>>();
const roomsPresent = new Map<string, Set<string>>();
const roomsVisible = new Map<string, Set<string>>();
for (const room of rooms) {
	for (const object of room[Objects]) {
		const owner: string | undefined = (object as any)[Owner];
		if (owner !== undefined) {
			if (object[Variant] === 'controller') {
				getOrSet(roomsControlled, owner, () => new Set).add(room.name);
			}
			getOrSet(roomsPresent, owner, () => new Set).add(room.name);
			getOrSet(roomsVisible, owner, () => new Set).add(room.name);
		}
	}
}

// Collect users
const usersCode = db.getCollection('users.code');
const users = db.getCollection('users').find().map(user => {
	const code = usersCode.find({ user: user._id });
	const active: boolean = ![ '2', '3' ].includes(user._id) && user.active;
	return {
		id: user._id,
		username: user.username,
		registeredDate: +new Date(user.registeredDate),
		active,
		cpu: user.cpu,
		cpuAvailable: user.cpuAvailable,
		gcl: user.gcl,
		badge: user.badge === undefined ? '' : JSON.stringify(user.badge),
		roomsControlled: roomsControlled.get(user._id) ?? new Set,
		roomsPresent: roomsPresent.get(user._id) ?? new Set,
		roomsVisible: roomsVisible.get(user._id) ?? new Set,
		code: {
			branch: Fn.firstMatching(code, code => code.activeWorld)?._id ?? null,
			branches: code.map(row => ({
				id: row._id,
				name: row.branch,
				timestamp: row.timestamp,
			})),
		},
	};
});

// Collect terrain data
const roomsTerrain = new Map(db.getCollection('rooms.terrain').find().map(({ room, terrain }) => {
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

// Save Game object and initialize shard
const roomNames = new Set(Fn.map(rooms, room => room.name));
const userIds = new Set(users.filter(user => user.active).map(user => user.id));
{
	// Flush databases at the same time because they may point to the same service
	const shardConfig = config.shards[0];
	const [ blob, data ] = await Promise.all([
		connectToProvider(shardConfig.blob, 'blob'),
		connectToProvider(shardConfig.data, 'keyval'),
	]);
	await Promise.all([ blob.flushdb(), data.flushdb() ]);
	// Save required blob data
	await blob.set('terrain', makeWriter(MapSchema.schema)(roomsTerrain));
	await blob.save();
	blob.disconnect();
	// Save required keyval data
	await data.sadd('rooms', [ ...roomNames ]);
	await data.sadd('users', [ ...userIds ]);
	await data.set('time', gameTime);
	await data.save();
	data.disconnect();
}
const shard = await Shard.connect('shard0');
const { blob } = shard;

// Save rooms
for (const room of rooms) {
	await shard.saveRoom(room.name, gameTime, room as never);
}

// Save users
for (const user of users) {
	await blob.set(`user/${user.id}/info`, User.write(user));
}

// Save user memory
for (const user of users) {
	const memory: string | undefined = env[`memory:${user.id}`];
	if (memory !== undefined) {
		await saveMemoryBlob(shard, user.id, utf16ToBuffer(memory));
	}
}

// Write placeholder authentication data
await blob.set('auth', Auth.write(users.map(user => ({
	key: `username:${Auth.flattenUsername(user.username)}`,
	user: user.id,
}))));

// Save user code
await Promise.all(db.getCollection('users.code').find().map(async row => {
	const modules = new Map(Object.entries(row.modules).map(([ key, data ]) => {
		const name = key.replace(/\$DOT\$/g, '.').replace(/\$SLASH\$/g, '/').replace(/\$BACKSLASH\$/g, '\\');
		return [ name, data as string ];
	}));
	await blob.set(`user/${row.user}/${row._id}`, CodeSchema.write({
		modules,
	}));
}));

// Flush everything to disk
await blob.save();
shard.disconnect();
