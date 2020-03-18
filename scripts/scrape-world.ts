import { promises as fs } from 'fs';
import * as MapSchema from '~/engine/game/map';
import { RoomPosition } from '~/engine/game/position';
import * as Room from '~/engine/game/room';
import * as Schema from '~/engine/game/schema';
import { TerrainWriter } from '~/engine/game/terrain';
import { Variant } from '~/engine/schema/format';
import { getWriter } from '~/engine/schema/write';
import { BufferView } from '~/engine/schema/buffer-view';
import { BlobStorage } from '~/storage/blob';

const [ jsonSource ] = process.argv.slice(2);
if (jsonSource === undefined) {
	console.error(`Usage: ${process.argv[1]} db.json`);
	process.exit(1);
}

(async() => {
	// Load JSON data and connect to blob storage
	const collections: Record<string, any[]> = {};
	for (const collection of JSON.parse(await fs.readFile(jsonSource, 'utf8')).collections) {
		collections[collection.name] = collection.data;
	}
	const envData = collections.env[0].data;
	const { gameTime } = envData;
	const blobStorage = await BlobStorage.connect('/');
	const view = new BufferView(new ArrayBuffer(1024 * 1024 * 32));

	// Collect initial room data
	const rooms = new Map(collections.rooms.map(room => ({
		name: room._id,
		[Room.objects]: new Map,
	})).map(room => [ room.name, room ]));

	// Load room objects
	collections['rooms.objects'].map(object => {
		const roomObject = {
			id: object._id,
			pos: new RoomPosition(object.x, object.y, object.room),
			effects: [],
		};
		switch (object.type) {
			case 'source':
				return {
					...roomObject,
					[Variant]: 'source',
					room: object.room,
					energy: object.energy,
					energyCapacity: object.energyCapacity,
				};
		}
	}).forEach(roomObject => {
		if (roomObject !== undefined) {
			rooms.get(roomObject.pos.roomName)![Room.objects].set(roomObject.id, roomObject);
		}
	});

	// Save rooms
	const writeRoom = getWriter(Schema.schema.Room, Schema.interceptorSchema);
	for (const [ roomName, room ] of rooms) {
		const length = writeRoom(room, view, 0);
		await blobStorage.save(`ticks/${gameTime}/${roomName}`, view.uint8.subarray(0, length));
	}

	// Read room data from rooms.terrain collection
	const roomsTerrain = collections['rooms.terrain'].map((room: { room: string; terrain: string }) => {
		const terrain = new TerrainWriter;
		for (let xx = 0; xx < 50; ++xx) {
			for (let yy = 0; yy < 50; ++yy) {
				terrain.set(xx, yy, Number(room.terrain[yy * 50 + xx]));
			}
		}
		return {
			roomName: room.room,
			terrain,
		};
	});
	roomsTerrain.sort((left, right) => left.roomName.localeCompare(right.roomName));

	// Make writer and save
	const writeWorld = getWriter(MapSchema.schema.World, MapSchema.interceptorSchema);
	{
		const length = writeWorld(roomsTerrain, view, 0);
		await blobStorage.save('terrain', view.uint8.subarray(0, length));
	}

})().catch(err => console.error(err));
