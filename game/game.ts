import { runOnce } from '~/lib/memoize';

import { Creep } from './objects/creep';
import { GameMap } from './map';
import { Room } from './room';
import { RoomObject } from './objects/room-object';
import { StructureSpawn } from './objects/structures/spawn';

declare global {
	let Game: Game;
}

const map = runOnce(() => new GameMap);

export class Game {
	map = map();

	creeps: Dictionary<Creep> = Object.create(null);
	rooms: Dictionary<Room> = Object.create(null);
	spawns: Dictionary<StructureSpawn> = Object.create(null);

	#objects = new Map<string, RoomObject>();

	constructor(
		time: number,
		rooms: Room[],
	) {
		setTime(time);
		for (const room of rooms) {
			this.rooms[room.name] = room;
			for (const object of room._objects) {
				this.#objects.set(object.id, object);
				if (object instanceof StructureSpawn) {
					this.spawns[object.name] = object;
				} else if (object instanceof Creep) {
					this.creeps[object.name] = object;
				}
			}
		}
	}

	get time() {
		return time;
	}

	/**
	 * Get an object with the specified unique ID. It may be a game object of any type. Only objects
	 * from the rooms which are visible to you can be accessed.
	 * @param id The unique identifier
	 */
	getObjectById(id: string) {
		return this.#objects.get(id);
	}
}

export let time = NaN;
export function setTime(currentTime: number) {
	time = currentTime;
}
