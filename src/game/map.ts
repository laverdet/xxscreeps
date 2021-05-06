import type { Adapter } from 'xxscreeps/utility/astar';
import type { ExitType } from 'xxscreeps/game/room/find';
import type { Room } from 'xxscreeps/game/room';
import type { TypeOf } from 'xxscreeps/schema';

import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import * as Terrain from './terrain';
import { RoomPosition, generateRoomName, getOffsetsFromDirection, parseRoomName } from 'xxscreeps/game/position';
import { compose, declare, makeReader, struct, vector } from 'xxscreeps/schema';
import { astar } from 'xxscreeps/utility/astar';
import { build } from 'xxscreeps/engine/schema';
import { getDirection } from 'xxscreeps/game/position/direction';

// Schema
const roomTerrain = () => struct({
	exits: 'uint8',
	terrain: Terrain.format,
});
export const schema = build(declare('World', compose(vector(struct({
	name: 'string',
	info: roomTerrain,
})), {
	compose: world => new Map(world.map(room => [ room.name, room.info ])),
	decompose: (world: Map<string, TypeOf<typeof roomTerrain>>) => {
		const vector = [ ...Fn.map(world.entries(), ([ name, info ]) => ({ name, info })) ];
		vector.sort((left, right) => left.name.localeCompare(right.name));
		return vector;
	},
})));

type TerrainByRoom = TypeOf<typeof schema>;

type FindRoute = {
	routeCallback?: (roomName: string, fromRoomName: string) => number;
};

/**
 * A global object representing world map. Use it to navigate between rooms.
 */
export class GameMap {
	#terrain: TerrainByRoom;
	#height: number;
	#width: number;

	constructor(terrain: TerrainByRoom) {
		this.#terrain = terrain;
		let maxX = -Infinity;
		let minX = Infinity;
		let maxY = -Infinity;
		let minY = Infinity;
		for (const roomName of terrain.keys()) {
			const room = parseRoomName(roomName);
			maxX = Math.max(room.rx, maxX);
			minX = Math.min(room.rx, minX);
			maxY = Math.max(room.ry, maxY);
			minY = Math.min(room.ry, minY);
		}
		this.#width = maxX - minX;
		this.#height = maxY - minY;
	}

	/**
	 * List all exits available from the room with the given name.
	 * @param roomName The room name.
	 */
	describeExits(roomName: string) {
		const info = this.#terrain.get(roomName);
		if (info) {
			const room = parseRoomName(roomName);
			const exits = Fn.reject([ C.TOP, C.RIGHT, C.BOTTOM, C.LEFT ], direction =>
				(info.exits & (2 ** ((direction - 1) >>> 1))) === 0);
			return Fn.fromEntries(Fn.map(exits, direction => {
				const offsets = getOffsetsFromDirection(direction);
				return [ direction, generateRoomName(room.rx + offsets.dx, room.ry + offsets.dy) ];
			}));
		}
		return null as never;
	}

	/**
	 * Find the exit direction from the given room en route to another room.
	 * @param fromRoom Start room name or room object.
	 * @param toRoom Finish room name or room object.
	 * @param opts An object with the pathfinding options. See `findRoute`.
	 */
	findExit(fromRoom: string | Room, toRoom: string | Room, opts: FindRoute = {}) {
		const route = this.findRoute(fromRoom, toRoom, opts);
		if (typeof route === 'number') {
			return route;
		} else if (route.length === 0) {
			return C.ERR_INVALID_ARGS;
		}
		return route[0].exit;
	}

	/**
	 * Find route from the given room to another room.
	 * @param fromRoom Start room name or room object.
	 * @param toRoom Finish room name or room object.
	 * @param opts An object with the following options:
	 *   `routeCallback` This callback accepts two arguments: function(roomName, fromRoomName). It can
	 *   be used to calculate the cost of entering that room. You can use this to do things like
	 *   prioritize your own rooms, or avoid some rooms. You can return a floating point cost or
	 *   Infinity to block the room.
	 */
	findRoute(fromRoom: string | Room, toRoom: string | Room, opts: FindRoute = {}) {
		// Sanity check
		const fromName = extractRoomName(fromRoom);
		const toName = extractRoomName(toRoom);
		if (!this.#terrain.has(fromName) || !this.#terrain.has(toName)) {
			return C.ERR_NO_PATH;
		}

		// Set up algorithm adapter
		const origin = parseRoomName(fromName);
		const destination = parseRoomName(toName);
		const maxDistance = 30;
		const offsetX = origin.rx + maxDistance;
		const offsetY = origin.ry + maxDistance;
		const adapter: Adapter<{ rx: number; ry: number }> = {
			id(value) {
				const rx = offsetX - value.rx;
				const ry = offsetY - value.ry;
				if (rx < 0 || rx >= maxDistance * 2 || ry < 0 || ry >= maxDistance * 2) {
					return null;
				}
				return rx * maxDistance * 2 + ry;
			},

			value(id) {
				return {
					rx: offsetX - Math.floor(id / (maxDistance * 2)),
					ry: offsetY - id % (maxDistance * 2),
				};
			},

			sizeof() {
				return (maxDistance * 2) ** 2;
			},
		};

		// Execute search
		const { routeCallback } = opts;
		const route = astar(
			maxDistance ** 2,
			adapter,
			[ origin ],
			pos => Math.abs(destination.rx - pos.rx) + Math.abs(destination.ry - pos.ry),
			routeCallback ?
				(to, from) => routeCallback(generateRoomName(from.rx, from.ry), generateRoomName(to.rx, to.ry)) :
				() => 1,
			pos => Fn.map(Object.values(this.describeExits(generateRoomName(pos.rx, pos.ry))), parseRoomName));
		if (route) {
			const moves = Fn.shift(Fn.scan(route, [ origin, origin ] as const, (prev, next) => [ prev[1], next ] as const)).rest;
			return [ ...Fn.map(moves, ([ prev, next ]) => ({
				exit: getDirection(next.rx - prev.rx, next.ry - prev.ry) as ExitType,
				room: generateRoomName(next.rx, next.ry),
			})) ];
		} else {
			return C.ERR_NO_PATH;
		}
	}

	/**
	 * Get the linear distance (in rooms) between two rooms. You can use this function to estimate the
	 * energy cost of sending resources through terminals, or using observers and nukes.
	 * @param roomName1 The name of the first room.
	 * @param roomName2 The name of the second room.
	 * @param continuous Whether to treat the world map continuous on borders. Set to true if you want
	 * to calculate the trade or terminal send cost. Default is false.
	 */
	getRoomLinearDistance(roomName1: string, roomName2: string, continuous = false) {
		const room1 = parseRoomName(roomName1);
		const room2 = parseRoomName(roomName2);
		const dx = Math.abs(room1.rx - room2.rx);
		const dy = Math.abs(room1.ry - room2.ry);
		if (continuous) {
			return Math.max(
				Math.min(this.#width - dx, dx),
				Math.min(this.#height - dy, dy),
			);
		}
		return Math.max(dx, dy);
	}

	/**
	 * Gets availability status of the room with the specified name. Learn more about starting areas
	 * from [this article](https://docs.screeps.com/start-areas.html).
	 */
	getRoomStatus() {
		console.error('TODO: getRoomStatus');
		return { status: 'normal', timestamp: null };
	}

	/**
	 * Get a `Room.Terrain` object which provides fast access to static terrain data. This method works
	 * for any room in the world even if you have no access to it.
	 * @param roomName The room name.
	 */
	getRoomTerrain(roomName: string) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
		return this.#terrain.get(roomName)?.terrain!;
	}

	/**
	 * Get terrain type at the specified room position. This method works for any room in the world even
	 * if you have no access to it.
	 * @deprecated
	 */
	getTerrainAt(...args: [ position: RoomPosition ] | [ x: number, y: number, roomName: string ]) {
		const pos = args.length === 1 ? args[0] : new RoomPosition(args[0], args[1], args[2]);
		const info = this.#terrain.get(pos.roomName);
		if (info) {
			return Terrain.terrainMaskToString[info.terrain.get(pos.x, pos.y)];
		}
	}

	/**
	 * Returns the world size as a number of rooms between world corners. For example, for a world
	 * with rooms from W50N50 to E50S50 this method will return 102.
	 */
	getWorldSize() {
		return Math.max(this.#height, this.#width);
	}

	/**
	 * Check if the room is available to move into.
	 * @deprecated
	 */
	isRoomAvailable() {
		console.error('TODO: isRoomAvailable');
		return false;
	}
}

/**
 * Runtime information about the current shard / world
 */
export class World {
	map: GameMap;
	terrain: TerrainByRoom;

	constructor(
		public name: string,
		public terrainBlob: Readonly<Uint8Array>,
	) {
		this.terrain = reader(terrainBlob);
		this.map = new GameMap(this.terrain);
	}

	/**
	 * Returns an iterator of all rooms and terrain.
	 */
	entries() {
		return Fn.map(this.terrain.entries(), ([ roomName, info ]) => [ roomName, info.terrain ] as const);
	}
}

const reader = makeReader(schema);

function extractRoomName(room: string | Room) {
	if (typeof room === 'object') {
		return room.name;
	} else {
		return room;
	}
}
