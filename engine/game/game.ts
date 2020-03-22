import { Room, Objects } from './room';
import { RoomObject } from './room-object';
import { StructureSpawn } from './structures/spawn';

export class Game {
	#objects = new Map<string, RoomObject>();
	spawns: Dictionary<StructureSpawn> = Object.create(null);

	constructor(rooms: Room[]) {
		for (const room of rooms) {
			for (const object of room[Objects]) {
				object.room = room;
				this.#objects.set(object.id, object);
				if (object instanceof StructureSpawn) {
					this.spawns[object.name] = object;
				}
			}
		}
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
