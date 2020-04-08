import { IntentManager } from './intents';
import map from './map';
import { Room } from './room';
import { Creep } from './objects/creep';
import { ConstructionSite } from './objects/construction-site';
import { RoomObject } from './objects/room-object';
import { StructureSpawn } from './objects/structures/spawn';
import { AnyStructure, Structure } from './objects/structures';
import { flush as flushPathFinder } from '~/game/path-finder';

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
	flags = {};
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

export let constructionSites: Dictionary<ConstructionSite> = Object.create(null);
export let creeps: Dictionary<Creep> = Object.create(null);
export let rooms: Dictionary<Room> = Object.create(null);
export let spawns: Dictionary<StructureSpawn> = Object.create(null);
export let structures: Dictionary<AnyStructure> = Object.create(null);

export let me = '';
export let time = NaN;

const objects = new Map<string, RoomObject>();

/**
 * Get an object with the specified unique ID. It may be a game object of any type. Only objects
 * from the rooms which are visible to you can be accessed.
 * @param id The unique identifier
 */
export function getObjectById(id: string) {
	return objects.get(id);
}

// Intents
export let intents: IntentManager;

export function initializeIntents() {
	intents = new IntentManager;
}

export function flushIntents() {
	flushPathFinder();
	return intents;
}

/**
 * This sets up global context enough that `Game.time` and `Creep..my` will work but intents and
 * `Game.getObjectById` won't work. This is used by backend readers.
 */
export function runAsUser<Type>(userId: string, time_: number, task: () => Type) {
	me = userId;
	time = time_;
	try {
		return task();
	} finally {
		me = '';
		time = NaN;
	}
}

/**
 * Used by the processor to run `tick` events
 */
export function runWithTime<Type>(time_: number, task: () => Type) {
	time = time_;
	try {
		return task();
	} finally {
		time = NaN;
	}
}

/**
 * This initializes `getObjectById`, Game.rooms`, `Game.creeps`, etc.
 */
export function runWithState<Type>(rooms_: Room[], task: () => Type) {
	for (const room of rooms_) {
		rooms[room.name] = room;
		if (me === '') {
			// Branch for processor (no `my`)
			for (const object of room._objects) {
				objects.set(object.id, object);
			}
		} else {
			// Branch for runner
			for (const object of room._objects) {
				objects.set(object.id, object);
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
	}
	try {
		return task();
	} finally {
		rooms = Object.create(null);
		objects.clear();
		if (me !== '') {
			constructionSites = Object.create(null);
			creeps = Object.create(null);
			spawns = Object.create(null);
			structures = Object.create(null);
		}
	}
}

/**
 * Used by the runtime, sets up everything the user's script needs and invokes the callback with a
 * fresh `Game` object
 */
export function runForUser(userId: string, time_: number, rooms: Room[], task: (game: Game) => void) {
	runAsUser(userId, time_, () =>
		runWithState(rooms, () => task(new Game)));
}
