import { writeFileSync } from 'fs';
import { readFile } from 'fs/promises';
import fetch from 'node-fetch';
import { checkArguments } from 'xxscreeps/config/arguments';
import { Database, Shard } from 'xxscreeps/engine/db';

// Schemas
import * as C from 'xxscreeps/game/constants';
import * as MapSchema from 'xxscreeps/game/map';
import type { RoomObject } from 'xxscreeps/game/object';
import { RoomPosition } from 'xxscreeps/game/position';
import { Room } from 'xxscreeps/game/room';
import { flushUsers } from 'xxscreeps/game/room/room';
import { TerrainWriter } from 'xxscreeps/game/terrain';
import { StructureController } from 'xxscreeps/mods/controller/controller';
import { StructureWall } from 'xxscreeps/mods/defense/wall';
import { Mineral } from 'xxscreeps/mods/mineral/mineral';
import { StructureKeeperLair } from 'xxscreeps/mods/source/keeper-lair';
import { Source } from 'xxscreeps/mods/source/source';
import type { Structure } from 'xxscreeps/mods/structure/structure';

// Objects
import { makeWriter } from 'xxscreeps/schema/write';
import * as Fn from 'xxscreeps/utility/functional';

const argv = checkArguments({
	argv: true,
	boolean: [ 'dont-overwrite' ] as const,
});
const dontOverwrite = argv['dont-overwrite'];

const jsonSource = argv.argv[0] ?? 'map-mmo-shard1';

function forUser(userId: string | null) {
	return userId === 'f4b532d08c3952a' ? '1' : userId;
}

function withRoomObject(from: any, into: RoomObject) {
	into.id = from._id;
	into.pos = new RoomPosition(from.x, from.y, from.room);
	if (from.user !== undefined) {
		into['#user'] = forUser(from.user ?? null);
	}
}

function withStructure(from: any, into: Structure) {
	withRoomObject(from, into);
	if (from.hits) {
		into.hits = from.hits;
	}
}

let data: { description: string; rooms: { room: string; terrain: string; objects: any[] }[] };

try {
	data = JSON.parse(await readFile(`map-${jsonSource}.json`, 'utf8'));
} catch {
	const res = await fetch(`https://maps.screepspl.us/maps/map-${jsonSource}.json`);
	try {
		data = await res.json();
		writeFileSync(`map-${jsonSource}.json`, JSON.stringify(data));
	} catch (err) {
		console.log('error', err);
		process.exit(0);
	}
}

const db = await Database.connect();
const gameTime = 1;

if (dontOverwrite && await db.data.scard('users') > 0) {
	console.log('Found existing data, exiting');
	process.exit(0);
}
{
	// Flush databases at the same time because they may point to the same service
	const shard = await Shard.connect(db, 'shard0');
	await Promise.all([
		shard.blob.flushdb(),
		shard.data.flushdb(),
	]);
	// Initialize blank database
	await shard.data.set('time', gameTime);
	await Promise.all([
		shard.blob.save(),
		shard.data.save(),
	]);
	shard.disconnect();
}

const shard = await Shard.connect(db, 'shard0');
const { blob } = shard;

// Save terrain data
const roomsTerrain: Map<string, { exits: number; terrain: TerrainWriter }> = new Map(data.rooms.map((entry: any) => {
	const writer = new TerrainWriter;
	for (let xx = 0; xx < 50; ++xx) {
		for (let yy = 0; yy < 50; ++yy) {
			// 3 == WALL + SWAMP.. turn that back into WALL
			const value = Number(entry.terrain[yy * 50 + xx]);
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
	return [ entry.room as string, {
		exits,
		terrain: writer,
	} ];
}));

await blob.set('terrain', makeWriter(MapSchema.schema)(roomsTerrain));

const rooms = data.rooms.map((entry: any) => {
	const objects = entry.objects;
	const instance = new Room;
	instance.name = entry.room;
	instance['#level'] = -1;
	// @ts-expect-error
	instance['#objects'] = [ ...Fn.filter(objects.map((object: any) => {
		object.room = entry.room;
		object._id = Math.random().toString(18).substr(2, 15);

		switch (object.type) {

			case 'constructedWall': {
				const wall = new StructureWall;
				withStructure(object, wall);
				return wall;
			}

			case 'controller': {
				instance['#level'] = object.level ?? 0;
				instance['#safeModeUntil'] = object.safeMode;
				instance['#user'] = null;

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

// Finish up

await db.save();
await shard.save();
db.disconnect();
shard.disconnect();
