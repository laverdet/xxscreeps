import Loki from 'lokijs';
import { execSync } from 'child_process';
import { topLevelTask } from '~/lib/task';

import { RoomPosition } from '~/game/position';
import { TerrainWriter } from '~/game/terrain';
import * as StoreIntents from '~/engine/processor/intents/store';

// Schemas
import * as Auth from '~/backend/auth';
import * as CodeSchema from '~/engine/metadata/code';
import * as GameSchema from '~/engine/metadata/game';
import * as MapSchema from '~/game/map';
import * as RoomSchema from '~/engine/schema/room';
import * as User from '~/engine/metadata/user';

import { Variant } from '~/lib/schema/format';
import { getWriter } from '~/lib/schema/write';
import { BlobStorage } from '~/storage/blob';
import { accumulate, filterInPlace, getOrSet, mapInPlace, firstMatching } from '~/lib/utility';

const [ jsonSource ] = process.argv.slice(2);
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
		_owner: object.user,
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

topLevelTask(async() => {
	// Load JSON data and connect to blob storage
	const db = new Loki(jsonSource);
	db.loadDatabase();
	execSync('rm -rf ./data/*');
	const blobStorage = await BlobStorage.create();

	// Collect env data
	const { gameTime }: { gameTime: number } = db.getCollection('env').findOne().data;

	// Collect room data
	const roomObjects = db.getCollection('rooms.objects');
	const rooms = db.getCollection('rooms').find().map(room => ({
		name: room._id,
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
	}));

	// Save rooms
	for (const room of rooms) {
		await blobStorage.save(`ticks/${gameTime}/${room.name}`, RoomSchema.write(room));
	}

	// Collect terrain data
	const roomsTerrain = new Map(db.getCollection('rooms.terrain').find().map(({ room, terrain }) => {
		const writer = new TerrainWriter;
		for (let xx = 0; xx < 50; ++xx) {
			for (let yy = 0; yy < 50; ++yy) {
				writer.set(xx, yy, Number(terrain[yy * 50 + xx]));
			}
		}
		return [ room as string, writer ];
	}));

	// Write terrain data
	await blobStorage.save('terrain', getWriter(MapSchema.format)(roomsTerrain));

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
				branch: firstMatching(code, code => code.activeWorld)?._id,
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
		await blobStorage.save(`user/${user.id}/info`, User.write(user));
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
	await blobStorage.save('game', GameSchema.write(game));

	// Write placeholder authentication data
	await blobStorage.save('auth', Auth.write([]));

	// Save user code
	await Promise.all(db.getCollection('users.code').find().map(async row => {
		const modules = new Map(Object.entries(row.modules).map(([ key, data ]) => {
			const name = key.replace(/\$DOT\$/g, '.').replace(/\$SLASH\$/g, '/').replace(/\$BACKSLASH\$/g, '\\');
			return [ name, data as string ];
		}));
		await blobStorage.save(`user/${row.user}/${row._id}`, CodeSchema.write({
			modules,
		}));
	}));

	// Flush everything to disk
	await blobStorage.flush();
});
