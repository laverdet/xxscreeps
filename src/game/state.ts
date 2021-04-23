import type { Flag } from './flag';
import type { AnyRoomObject, Room } from './room';
import type { RoomObject } from './object';
import * as Fn from 'xxscreeps/utility/functional';
import { gameInitializers } from './symbols';
import map from './map';

import { flush as flushPathFinder } from 'xxscreeps/game/path-finder';
import { FlushFindCache, FlushObjects, InsertObject, Objects } from 'xxscreeps/game/room';
import { AddToMyGame } from './object/symbols';
import * as Visual from './visual';

/**
 * The main global game object containing all the game play information.
 */
export class Game {
	cpu = {
		bucket: 10000,
		limit: 10000,
		tickLimit: 500,
		getUsed: () => 0,
		getHeapStatistics: () => 0,
	};
	gcl = {
		level: 1,
	};
	flags: Record<string, Flag> = Object.create(null);
	market = {
		orders: [],
		getAllOrders: () => [],
		incomingTransactions: [],
		outgoingTransactions: [],
	};
	shard = {
		name: 'shard0',
		type: 'normal',
	};
	map = map;
	rooms = rooms;
	time = time;
	getObjectById = getObjectById;
	notify() {}
}

// Core global state
export let instance: Game;
export let me = '';
export let time = NaN;
export let rooms: Record<string, Room> = Object.create(null);
export const objects = new Map<string, RoomObject>();

/**
 * Register a function which will run on newly-created `Game` objects
 */
export function registerGameInitializer(fn: (game: Game) => void) {
	gameInitializers.push(fn);
}

/**
 * Get an object with the specified unique ID. It may be a game object of any type. Only objects
 * from the rooms which are visible to you can be accessed.
 * @param id The unique identifier
 */
export function getObjectById<Type extends RoomObject = AnyRoomObject>(id: string) {
	return objects.get(id) as Type | undefined;
}

/**
 * Remove an object from global Game state
 * @private
 */
export function removeObject(object: RoomObject) {
	objects.delete(object.id);
}

/**
 * This initializes user-agnostic data like `getObjectById`, `Game.rooms`, and `Game.time`
 */
export function runWithState<Type>(rooms_: Room[], time_: number, task: () => Type) {
	time = time_;
	for (const room of rooms_) {
		rooms[room.name] = room;
		for (const object of room[Objects]) {
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
	instance = new Game;
	gameInitializers.forEach(fn => fn(instance));
	me = userId;
	for (const room of Object.values(rooms)) {
		room[FlushFindCache]();
		for (const object of room[Objects]) {
			if ((object as any).my) {
				object[AddToMyGame](instance);
			}
		}
	}
	try {
		return task();
	} finally {
		flushPathFinder();
		instance = undefined as never;
		me = '';
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
		instance.flags = flags_;
		Visual.clear();
		const flushedRooms = new Set<Room>();
		for (const flag of Object.values(instance.flags)) {
			const room = rooms[flag.pos.roomName];
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (room) {
				flushedRooms.add(room);
				room[InsertObject](flag);
			}
		}
		Fn.map(flushedRooms, room => room[FlushObjects]);
		task(instance);
	}));
}
