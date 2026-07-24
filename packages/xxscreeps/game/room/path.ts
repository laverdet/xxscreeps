import type { Direction, RoomPosition } from 'xxscreeps/game/position.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { getOffsetsFromDirection } from 'xxscreeps/game/direction.js';
import { Game } from 'xxscreeps/game/index.js';
import * as PathFinder from 'xxscreeps/game/pathfinder/index.js';
import { extend } from 'xxscreeps/utility/utility.js';
import { Room } from './room.js';

export interface FindPathOptions extends PathFinder.RoomSearchOptions {
	/**
	 * If true, the result path will be serialized using `Room.serializePath`.
	 * @public
	 * @default false
	 */
	serialize?: boolean;
}

export type RoomPath = {
	x: number;
	y: number;
	dx: -1 | 0 | 1;
	dy: -1 | 0 | 1;
	direction: Direction;
}[];

Object.assign(Room, {
	serializePath(path: RoomPath) {
		if (!Array.isArray(path)) {
			throw new Error('`path` is not an array');
		}
		const [ origin ] = path;
		if (origin === undefined) {
			return '';
		}
		if (origin.x < 0 || origin.y < 0) {
			throw new Error('path coordinates cannot be negative');
		}
		let result = `${origin.x}`.padStart(2, '0') + `${origin.y}`.padStart(2, '0');
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

		let xx = Number(path.substr(0, 2));
		let yy = Number(path.substr(2, 2));
		if (Number.isNaN(xx) || Number.isNaN(yy)) {
			throw new Error('`path` is not a valid serialized path string');
		}
		for (let ii = 4; ii < path.length; ++ii) {
			const direction = Number(path[ii]) as Direction;
			const { dx, dy } = getOffsetsFromDirection(direction);
			if (ii > 4) {
				xx += dx;
				yy += dy;
			}
			result.push({
				x: xx,
				y: yy,
				dx, dy,
				direction,
			});
		}
		return result;
	},
});

extend(Room, {
	findExitTo(room: Room | string) {
		const route = Game.map.findRoute(this, room);
		if (typeof route === 'number') {
			return route;
		} else {
			return route[0]?.exit ?? C.ERR_NO_PATH;
		}
	},

	findPath(origin: RoomPosition, goal: RoomPosition, options: FindPathOptions & { serialize?: boolean } = {}) {

		if (origin.isEqualTo(goal)) {
			return options.serialize ? '' : [];
		}

		// Delegate to `PathFinder` for main search
		const result = PathFinder.roomSearch(origin, [ goal ], options);

		// Add last position for automatic {range:1} paths
		if (
			(options.range ?? 0) === 0 &&
			(result.path.length
				? result.path.at(-1)?.getRangeTo(goal) === 1 :
				origin.isNearTo(goal))
		) {
			result.path.push(goal);
		}

		// Convert to room path
		const path: RoomPath = [];
		let previous = origin;
		for (const pos of result.path) {
			if (pos.roomName !== this.name) {
				break;
			}
			path.push({
				x: pos.x,
				y: pos.y,
				dx: pos.x - previous.x as -1 | 0 | 1,
				dy: pos.y - previous.y as -1 | 0 | 1,
				direction: previous.getDirectionTo(pos),
			});
			previous = pos;
		}
		if (options.serialize) {
			return Room.serializePath(path);
		}
		return path;
	},

	getTerrain() {
		return Game.map.getRoomTerrain(this.name);
	},
});
