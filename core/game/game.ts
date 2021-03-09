import type { Flag } from './flag';
import type { AnyRoomObject, Room } from './room';
import { IntentManager } from './intents';
import map from './map';
import { insertObject } from './room/methods';
import { Creep } from './objects/creep';
import { ConstructionSite } from 'xxscreeps/mods/construction/construction-site';
import { RoomObject } from './object';
import { StructureSpawn } from './objects/structures/spawn';
import { AnyStructure, Structure } from './objects/structures';
import { flush as flushPathFinder } from 'xxscreeps/game/path-finder';
import { flushFindCache } from 'xxscreeps/game/room/methods';

/**
 * The main global game object containing all the game play information.
 */
class Game {
	constructionSites = constructionSites;
	cpu = {
		getUsed: () => 0,
		getHeapStatistics: () => 0,
	};
	gcl = {
		level: 1,
	};
	flags = flags;
	market = {
		orders: [],
		getAllOrders: () => [],
		incomingTransactions: [],
		outgoingTransactions: [],

	};
	shard = {};
	creeps = creeps;
	map = map;
	rooms = rooms;
	spawns = spawns;
	structures = structures;
	time = time;
	getObjectById = getObjectById;
}

export let constructionSites: Record<string, ConstructionSite> = Object.create(null);
export let creeps: Record<string, Creep> = Object.create(null);
export let flags: Record<string, Flag> = Object.create(null);
export let rooms: Record<string, Room> = Object.create(null);
export let spawns: Record<string, StructureSpawn> = Object.create(null);
export let structures: Record<string, AnyStructure> = Object.create(null);

export let me = '';
export let time = NaN;

const objects = new Map<string, RoomObject>();

/**
 * Get an object with the specified unique ID. It may be a game object of any type. Only objects
 * from the rooms which are visible to you can be accessed.
 * @param id The unique identifier
 */
export function getObjectById<Type extends AnyRoomObject>(id: string) {
	return objects.get(id) as Type | undefined;
}

export function removeObject(object: RoomObject) {
	objects.delete(object.id);
}

// Intents
export let intents: IntentManager;

export function initializeIntents() {
	intents = new IntentManager;
}

export function flushIntents() {
	return intents;
}

/**
 * This initializes user-agnostic data like `getObjectById`, `Game.rooms`, and `Game.time`
 */
export function runWithState<Type>(rooms_: Room[], time_: number, task: () => Type) {
	time = time_;
	for (const room of rooms_) {
		rooms[room.name] = room;
		for (const object of room._objects) {
			objects.set(object.id, object);
		}
	}
	try {
		return task();
	} finally {
		time = NaN;
		rooms = Object.create(null);
		objects.clear();
	}
}

/*
 * Sets up user-specific lookups like `Game.creeps` and `Game.spawns` but without user runtime data
 * like memory and flags. Must be called within `runWithState`
 */
export function runAsUser<Type>(userId: string, task: () => Type) {
	me = userId;
	for (const room of Object.values(rooms)) {
		flushFindCache(room);
		for (const object of room._objects) {
			if ((object as { my: boolean }).my) {
				if (object instanceof Structure) {
					structures[object.id] = object;
					if (object instanceof StructureSpawn) {
						spawns[object.name] = object;
					}
				} else if (object instanceof Creep) {
					creeps[object.name] = object;
				} else if (object instanceof ConstructionSite) {
					constructionSites[object.id] = object;
				}
			}
		}

	}
	try {
		return task();
	} finally {
		flushPathFinder();
		me = '';
		constructionSites = Object.create(null);
		creeps = Object.create(null);
		spawns = Object.create(null);
		structures = Object.create(null);
	}
}

/**
 * Full runtime setup. Invokes the callback with a fresh `Game` object
 */
export function runForUser<Type>(
	userId: string,
	time: number,
	rooms_: Room[],
	flags_: Record<string, Flag>,
	task: (game: Game) => Type,
) {
	return runWithState(rooms_, time, () => runAsUser(userId, () => {
		try {
			flags = flags_;
			for (const flag of Object.values(flags)) {
				const room = rooms[flag.pos.roomName];
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
				if (room) {
					insertObject(room, flag);
				}
			}
			task(new Game);
		} finally {
			flags = {};
		}
	}));
}
