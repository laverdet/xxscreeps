import fs from 'fs/promises';

import { Database, Shard } from 'xxscreeps/engine/db';

// Schemas
import * as C from 'xxscreeps/game/constants';
import type { RoomObject } from 'xxscreeps/game/object';

import { RoomPosition } from 'xxscreeps/game/position';
import { Creep } from 'xxscreeps/mods/creep/creep';
import { StructureRampart } from 'xxscreeps/mods/defense/rampart';
import { StructureWall } from 'xxscreeps/mods/defense/wall';

// Objects
import type { ResourceType } from 'xxscreeps/mods/resource';
import type { Store } from 'xxscreeps/mods/resource/store';
import { OpenStore, SingleStore } from 'xxscreeps/mods/resource/store';
import { StructureRoad } from 'xxscreeps/mods/road/road';
import { StructureExtension } from 'xxscreeps/mods/spawn/extension';
import { StructureSpawn } from 'xxscreeps/mods/spawn/spawn';
import type { Structure } from 'xxscreeps/mods/structure/structure';

function forUser(userId: string | null) {
	return userId === 'f4b532d08c3952a' ? '1' : '92db0714f78e';
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

function withStore(from: any, into: { store: Store }) {
	for (const type in from.store) {
		into.store['#add'](type as ResourceType, from.store[type]);
	}
}

// const gameTime: number = env.gameTime - 1;

// Initialize and connect to database & shard
const db = await Database.connect();

const shard = await Shard.connect(db, 'shard0');

// @ts-expect-error
const importData = JSON.parse(await fs.readFile('out.json'));

const time = await shard.data.get('time');
if (!time) process.exit(1);
const gameTime = parseInt(time, 10);

// rooms
const roomList = Object.keys(importData.rooms);

for (const roomName of roomList) {
	const roomObjects: Record<string, any> = importData.rooms[roomName];
	const room = await shard.loadRoom(roomName, gameTime, false);
	console.log(roomName);
	for (const roomObject of Object.values(roomObjects)) {
		switch (roomObject.type) {
			case 'constructedWall':
				const wall = new StructureWall;
				withStructure(roomObject, wall);
				room['#insertObject'](wall, true);
				break;
			case 'spawn':
				const spawn = new StructureSpawn;
				withStructure(roomObject, spawn);
				spawn.store = SingleStore['#create'](C.RESOURCE_ENERGY, roomObject.storeCapacityResource.energy);
				withStore(roomObject, spawn);
				spawn.name = roomObject.name;
				room['#insertObject'](spawn, true);
				break;
			case 'controller':
				if (roomObject.reservation) continue;

				room['#level'] = roomObject.level ?? 0;
				room['#safeModeUntil'] = roomObject.safeMode;
				room['#user'] = forUser(roomObject.user ?? null);

				const controller = room.controller!;
				withStructure(roomObject, controller);
				controller.isPowerEnabled = roomObject.isPowerEnabled;
				controller.safeModeAvailable = roomObject.safeModeAvailable;
				controller['#downgradeTime'] = roomObject.downgradeTime;
				controller['#progress'] = roomObject.progress;
				controller['#safeModeCooldownTime'] = roomObject.safeModeCooldown;
				controller['#upgradeBlockedUntil'] = roomObject.upgradeBlocked;
				break;

			case 'creep': {
				if (roomObject.spawning) continue;
				const creep = new Creep;
				withRoomObject(roomObject, creep);
				creep.store = OpenStore['#create'](roomObject.storeCapacity);
				withStore(roomObject, creep);
				creep.body = roomObject.body;
				creep.hits = roomObject.hits;
				creep.name = roomObject.name;
				creep['#ageTime'] = roomObject.ageTime;
				room['#insertObject'](creep, true);
				break;
			}

			case 'extension': {
				const extension = new StructureExtension;
				withStructure(roomObject, extension);
				extension.store = SingleStore['#create'](C.RESOURCE_ENERGY, roomObject.storeCapacityResource.energy);
				withStore(roomObject, extension);
				room['#insertObject'](extension, true);
				break;
			}

			case 'rampart': {
				const rampart = new StructureRampart;
				withStructure(roomObject, rampart);
				rampart.isPublic = roomObject.isPublic;
				rampart['#nextDecayTime'] = roomObject.nextDecayTime;
				room['#insertObject'](rampart, true);
				break;
			}

			case 'road': {
				const road = new StructureRoad;
				withStructure(roomObject, road);
				// TODO: road['#terrain'] = roomsTerrain.get(road.pos.roomName)!.terrain.get(road.pos.x, road.pos.y);
				road['#nextDecayTime'] = roomObject.nextDecayTime;
				room['#insertObject'](road, true);
				break;
			}

			default:
				console.log(roomObject.type);
		}
	}
	room['#flushObjects']();
	await shard.saveRoom(roomName, gameTime, room);
}

// shard.loadRoom()

/*
// Collect room data
const roomObjects = loki.getCollection('rooms.objects');
const rooms = loki.getCollection('rooms').find().map(room => {
	const objects = roomObjects.find({ room: room._id });
	const instance = new Room;
	instance.name = room._id;
	instance['#level'] = -1;
	instance['#objects'] = [ ...Fn.filter(objects.map(object => {
		switch (object.type) {
			case 'constructedWall': {
				const wall = new StructureWall;
				withStructure(object, wall);
				return wall;
			}

			case 'controller': {
				instance['#level'] = object.level ?? 0;
				instance['#safeModeUntil'] = object.safeMode;
				instance['#user'] = forUser(object.user ?? null);

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

			case 'creep': {
				const creep = new Creep;
				withRoomObject(object, creep);
				creep.store = OpenStore['#create'](object.storeCapacity);
				withStore(object, creep);
				creep.body = object.body;
				creep.hits = object.hits;
				creep.name = object.name;
				creep['#ageTime'] = object.ageTime;
				return creep;
			}

			case 'extension': {
				const extension = new StructureExtension;
				withStructure(object, extension);
				extension.store = SingleStore['#create'](C.RESOURCE_ENERGY, object.storeCapacityResource.energy);
				withStore(object, extension);
				return extension;
			}

			case 'extractor': {
				const extractor = new StructureExtractor;
				withStructure(object, extractor);
				return extractor;
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

			case 'rampart': {
				const rampart = new StructureRampart;
				withStructure(object, rampart);
				rampart.isPublic = object.isPublic;
				rampart['#nextDecayTime'] = object.nextDecayTime;
				return rampart;
			}

			case 'road': {
				const road = new StructureRoad;
				withStructure(object, road);
				road['#terrain'] = roomsTerrain.get(road.pos.roomName)!.terrain.get(road.pos.x, road.pos.y);
				road['#nextDecayTime'] = object.nextDecayTime;
				return road;
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
				spawn.store = SingleStore['#create'](C.RESOURCE_ENERGY, object.storeCapacityResource.energy);
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

*/

// Finish up
await db.save();
await shard.save();
db.disconnect();
shard.disconnect();
