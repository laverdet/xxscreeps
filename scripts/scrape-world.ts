import Loki from 'lokijs';
import { execSync } from 'child_process';

import { RoomPosition } from 'xxscreeps/game/position';
import { TerrainWriter } from 'xxscreeps/game/terrain';
import * as StoreIntents from 'xxscreeps/engine/processor/intents/store';

// Schemas
import * as Auth from 'xxscreeps/backend/auth';
import * as CodeSchema from 'xxscreeps/engine/metadata/code';
import * as GameSchema from 'xxscreeps/engine/metadata/game';
import * as MapSchema from 'xxscreeps/game/map';
import * as RoomSchema from 'xxscreeps/engine/room';
import * as User from 'xxscreeps/engine/metadata/user';

import { Variant } from 'xxscreeps/schema/format';
import { makeWriter } from 'xxscreeps/schema/write';
import * as Storage from 'xxscreeps/storage';
import { EventLogSymbol } from 'xxscreeps/game/room/event-log';
import { accumulate, clamp, filterInPlace, getOrSet, mapInPlace, firstMatching } from 'xxscreeps/util/utility';

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
		_owner: object.user ?? null,
		hits: 0,
	};
}

function withStore(object: any) {
	const capacity = object.storeCapacityResource === undefined ?
		object.storeCapacity :
		accumulate(Object.values<number>(object.storeCapacityResource));
	return {
		store: StoreIntents.create(capacity, object.storeCapacityResource, object.store),
	};
}

// Load JSON data and connect to blob storage
const db = new Loki(jsonSource);
await new Promise<void>((resolve, reject) =>
	db.loadDatabase({}, (err?: Error) => err ? reject(err) : resolve()));
await Storage.initialize();
const storage = await Storage.connect('shard0');
const { persistence } = storage;
execSync('rm -rf ./data/*');

// Collect env data
const env = db.getCollection('env').findOne().data;
const { gameTime }: { gameTime: number } = env;

// Collect room data
const roomObjects = db.getCollection('rooms.objects');
const rooms = db.getCollection('rooms').find().map(room => ({
	name: room._id,
	_npcs: new Set<string>(),
	_npcMemory: new Map,
	_objects: [ ...filterInPlace(roomObjects.find({ room: room._id }).map(object => {
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
	[EventLogSymbol]: [],
}));

// Save rooms
for (const room of rooms) {
	await persistence.set(`room/${room.name}`, RoomSchema.write(room as never));
}

// Collect terrain data
const roomsTerrain = new Map(db.getCollection('rooms.terrain').find().map(({ room, terrain }) => {
	const writer = new TerrainWriter;
	for (let xx = 0; xx < 50; ++xx) {
		for (let yy = 0; yy < 50; ++yy) {
			writer.set(xx, yy, clamp(0, 2, Number(terrain[yy * 50 + xx])));
		}
	}
	return [ room as string, writer ];
}));

// Write terrain data
await persistence.set('terrain', makeWriter(MapSchema.format)(roomsTerrain));

// Get visible rooms for users
const roomsControlled = new Map<string, Set<string>>();
const roomsPresent = new Map<string, Set<string>>();
const roomsVisible = new Map<string, Set<string>>();
for (const room of rooms) {
	for (const object of room._objects) {
		const owner: string | undefined = (object as any)._owner;
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
		roomsControlled: (roomsControlled.get(user._id) ?? new Set),
		roomsPresent: (roomsPresent.get(user._id) ?? new Set),
		roomsVisible: (roomsVisible.get(user._id) ?? new Set),
		code: {
			branch: firstMatching(code, code => code.activeWorld)?._id ?? null,
			branches: code.map(row => ({
				id: row._id,
				name: row.branch,
				timestamp: row.timestamp,
			})),
		},
	};
});

// Save users
for (const user of users) {
	await persistence.set(`user/${user.id}/info`, User.write(user));
}

// Save user memory
for (const user of users) {
	const memory: string | undefined = env[`memory:${user.id}`];
	if (memory !== undefined) {
		const data = new Uint16Array(memory.length);
		for (let ii = 0; ii < data.length; ++ii) {
			data[ii] = memory.charCodeAt(ii);
		}
		await persistence.set(`memory/${user.id}`, new Uint8Array(data.buffer));
	}
}

// Save Game object
const roomNames = new Set(mapInPlace(rooms, room => room.name));
const userIds = new Set(users.filter(user => user.active).map(user => user.id));
const game = {
	time: gameTime,
	accessibleRooms: roomNames,
	activeRooms: roomNames,
	users: userIds,
};
await persistence.set('game', GameSchema.write(game));

// Write placeholder authentication data
await persistence.set('auth', Auth.write(users.map(user => ({
	key: `username:${Auth.flattenUsername(user.username)}`,
	user: user.id,
}))));

// Save user code
await Promise.all(db.getCollection('users.code').find().map(async row => {
	const modules = new Map(Object.entries(row.modules).map(([ key, data ]) => {
		const name = key.replace(/\$DOT\$/g, '.').replace(/\$SLASH\$/g, '/').replace(/\$BACKSLASH\$/g, '\\');
		return [ name, data as string ];
	}));
	await persistence.set(`user/${row.user}/${row._id}`, CodeSchema.write({
		modules,
	}));
}));

// Flush everything to disk
await persistence.save();
storage.disconnect();
Storage.terminate();
