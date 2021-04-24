import type { Terrain } from 'xxscreeps/game/terrain';
import * as PathFinder from 'xxscreeps/game/path-finder';
import { extend } from 'xxscreeps/utility/utility';
import { Direction, RoomPosition, getOffsetsFromDirection } from 'xxscreeps/game/position';
import { Game } from 'xxscreeps/game';
import { Room } from './room';

export type FindPathOptions = PathFinder.RoomSearchOptions & {
	serialize?: boolean;
};

export type RoomPath = {
	x: number;
	y: number;
	dx: -1 | 0 | 1;
	dy: -1 | 0 | 1;
	direction: Direction;
}[];

declare module './room' {
	interface Room {
		/**
		 * Find the exit direction en route to another room. Please note that this method is not required
		 * for inter-room movement, you can simply pass the target in another room into Creep.moveTo
		 * method.
		 * @param room Another room name or room object
		 */
		findExitTo(room: Room | string): any;

		/**
		 * Find an optimal path inside the room between fromPos and toPos using Jump Point Search algorithm.
		 * @param origin The start position
		 * @param goal The end position
		 * @param options
		 */
		findPath(origin: RoomPosition, goal: RoomPosition, options?: FindPathOptions & { serialize?: false }): RoomPath;
		findPath(origin: RoomPosition, goal: RoomPosition, options?: FindPathOptions & { serialize: true }): string;
		findPath(origin: RoomPosition, goal: RoomPosition, options?: FindPathOptions & { serialize?: boolean }): RoomPath | string;

		/**
		 * Serialize a path array into a short string representation, which is suitable to store in memory
		 * @param path A path array retrieved from Room.findPath
		 */
		serializePath(path: RoomPath): string;

		/**
		 * Deserialize a short string path representation into an array form
		 * @param path A serialized path string
		 */
		deserializePath(path: string): RoomPath;

		/**
		 * Get a Room.Terrain object which provides fast access to static terrain data. This method works
		 * for any room in the world even if you have no access to it.
		 */
		getTerrain(): Terrain;
	}
}

extend(Room, {
	findExitTo(room: Room | string) {
		const route = Game.map.findRoute(this, room);
		if (typeof route === 'object') {
			return route[0].exit;
		} else {
			return route;
		}
	},

	findPath(origin: RoomPosition, goal: RoomPosition, options: FindPathOptions & { serialize?: boolean } = {}) {

		// Delegate to `PathFinder` and convert the result
		const result = PathFinder.roomSearch(origin, [ goal ], options);
		const path: RoomPath = [];
		let previous = origin;
		for (const pos of result.path) {
			if (pos.roomName !== this.name) {
				break;
			}
			path.push({
				x: pos.x,
				y: pos.y,
				dx: pos.x - previous.x as never,
				dy: pos.y - previous.y as never,
				direction: previous.getDirectionTo(pos),
			});
			previous = pos;
		}
		if (options.serialize) {
			return this.serializePath(path);
		}
		return path;
	},

	serializePath(path: RoomPath) {
		if (!Array.isArray(path)) {
			throw new Error('`path` is not an array');
		}
		if (path.length === 0) {
			return '';
		}
		if (path[0].x < 0 || path[0].y < 0) {
			throw new Error('path coordinates cannot be negative');
		}
		let result = `${path[0].x}`.padStart(2, '0') + `${path[0].y}`.padStart(2, '0');
		for (const step of path) {
			result += step.direction;
		}
		return result;
	},

	deserializePath(path: string) {
		if (typeof path !== 'string') {
			throw new Error('`path` is not a string');
		}
		const result: RoomPath = [];
		if (path.length === 0) {
			return result;
		}

		let x = Number(path.substr(0, 2));
		let y = Number(path.substr(2, 2));
		if (Number.isNaN(x) || Number.isNaN(y)) {
			throw new Error('`path` is not a valid serialized path string');
		}
		for (let ii = 4; ii < path.length; ++ii) {
			const direction = Number(path[ii]) as Direction;
			const { dx, dy } = getOffsetsFromDirection(direction);
			if (ii > 4) {
				x += dx;
				y += dy;
			}
			result.push({
				x, y,
				dx, dy,
				direction,
			});
		}
		return result;
	},

	getTerrain() {
		return Game.map.getRoomTerrain(this.name)!;
	},
});
