import { promises as fs } from 'fs';
import { topLevelTask } from '~/lib/task';

import * as MapSchema from '~/game/map';
import { RoomPosition } from '~/game/position';
import * as Room from '~/game/room';
import * as RoomSchema from '~/engine/schema/room';
import { Owner } from '~/game/objects/room-object';
import * as Source from '~/game/objects/source';
import * as StructureController from '~/game/objects/structures/controller';
import { TerrainWriter } from '~/game/terrain';
import * as CodeSchema from '~/engine/metabase/code';
import { writeGame } from '~/engine/metabase/game';

import * as StoreIntents from '~/engine/processor/intents/store';

import { Variant } from '~/lib/schema/format';
import { getWriter } from '~/lib/schema/write';
import { BlobStorage } from '~/storage/blob';

const [ jsonSource ] = process.argv.slice(2);
if (jsonSource === undefined) {
	console.error(`Usage: ${process.argv[1]} db.json`);
	process.exit(1);
}

topLevelTask(async() => {
	// Load JSON data and connect to blob storage
	const collections: Record<string, any[]> = {};
	for (const collection of JSON.parse(await fs.readFile(jsonSource, 'utf8')).collections) {
		collections[collection.name] = collection.data;
	}
	const envData = collections.env[0].data;
	const { gameTime }: { gameTime: number } = envData;
	const blobStorage = await BlobStorage.create();
	const buffer = new Uint8Array(1024 * 1024 * 32);

	// Save helper
	function save(blob: string, length: number) {
		return blobStorage.save(blob, buffer.subarray(0, length));
	}

	// Collect initial room data
	const roomsByUser: Dictionary<Set<string>> = {};
	const rooms = new Map(collections.rooms.map(room => ({
		name: room._id,
		[Room.Objects]: [] as any[],
	})).map(room => [ room.name, room ]));

	// Load room objects
	collections['rooms.objects'].map(object => {
		const roomObject = {
			id: object._id,
			pos: new RoomPosition(object.x, object.y, object.room),
			[Owner]: object.user,
		};
		const withStructure = () => ({ ...roomObject });
		const withStore = () => {
			const capacity = object.storeCapacityResource === undefined ?
				object.storeCapacity :
				Object.values<number>(object.storeCapacityResource).reduce((sum, value) => sum + value, 0);
			return { store: StoreIntents.create(capacity, object.storeCapacityResource, object.store) };
		};
		switch (object.type) {
			case 'controller':
				return {
					...withStructure(),
					[Variant]: 'controller',
					[StructureController.DowngradeTime]: object.downgradeTime,
					isPowerEnabled: object.isPowerEnabled,
					level: object.level,
					[StructureController.Progress]: object.progress,
					safeMode: object.safeMode,
					safeModeAvailable: object.safeModeAvailable,
					safeModeCooldown: object.safeModeCooldown,
					[StructureController.UpgradeBlockedTime]: object.upgradeBlocked,
				};

			case 'spawn':
				return {
					...withStructure(),
					...withStore(),
					[Variant]: 'spawn',
					name: object.name,
				};

			case 'source':
				return {
					...roomObject,
					[Variant]: 'source',
					room: object.room,
					energy: object.energy,
					energyCapacity: object.energyCapacity,
					[Source.NextRegenerationTime]: gameTime + (object.ticksToRegeneration as number),
				};
		}
	}).forEach(roomObject => {
		if (roomObject !== undefined) {
			const owner: string = (roomObject as any)[Owner];
			if (owner !== undefined && owner.length > 1) {
				const rooms = roomsByUser[owner] ?? (roomsByUser[owner] = new Set);
				rooms.add(roomObject.pos.roomName);
			}
			rooms.get(roomObject.pos.roomName)![Room.Objects].push(roomObject);
		}
	});

	// Save rooms
	const writeRoom = getWriter(RoomSchema.format);
	for (const [ roomName, room ] of rooms) {
		await save(`ticks/${gameTime}/${roomName}`, writeRoom(room as Room.Room, buffer));
	}

	// Read room data from rooms.terrain collection
	const roomsTerrain = new Map(collections['rooms.terrain'].map((room: { room: string; terrain: string }) => {
		const terrain = new TerrainWriter;
		for (let xx = 0; xx < 50; ++xx) {
			for (let yy = 0; yy < 50; ++yy) {
				terrain.set(xx, yy, Number(room.terrain[yy * 50 + xx]));
			}
		}
		return [ room.room, terrain ];
	}));

	// Make writer and save terrain
	const writeWorld = getWriter(MapSchema.format);
	await save('terrain', writeWorld(roomsTerrain, buffer));

	// Collect users
	const users = new Map(collections.users.map(user => [
		user._id,
		{
			id: user._id,
			username: user.username,
			registeredDate: +new Date(user.registeredDate),
			active: user.active,
			cpu: user.cpu,
			cpuAvailable: user.cpuAvailable,
			gcl: user.gcl,
			badge: user.badge === undefined ? '{}' : JSON.stringify(user.badge),
			visibleRooms: (roomsByUser[user._id] ?? new Set<string>()),
		},
	]));

	// Save Game object
	const game = {
		time: gameTime,
		accessibleRooms: new Set([ ...rooms.values() ].map(room => room.name)),
		activeRooms: new Set([ ...rooms.values() ].map(room => room.name)),
		users,
	};
	await save('game', writeGame(game, buffer));

	// Collect user code
	const writeCode = getWriter(CodeSchema.format);
	for (const row of collections['users.code']) {
		const modules: any[] = [];
		for (const [ key, data ] of Object.entries(row.modules)) {
			const name = key.replace(/\$DOT\$/g, '.').replace(/\$SLASH\$/g, '/').replace(/\$BACKSLASH\$/g, '\\');
			modules.push({ name, data });
		}
		await save(`code/${row.user}`, writeCode({ modules }, buffer));
	}

	// Flush everything to disk
	await blobStorage.flush();
});
