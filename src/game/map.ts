import type { Room } from 'xxscreeps/game/room';
import type { ExitType } from 'xxscreeps/game/room/exit';
import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import * as Terrain from 'xxscreeps/game/terrain';
import { RoomPosition, getOffsetsFromDirection, parseRoomName, generateRoomName } from 'xxscreeps/game/position';
import { getDirection } from 'xxscreeps/game/position/direction';
import { TypeOf, compose, declare, makeReader, struct, vector } from 'xxscreeps/schema';
import { build } from 'xxscreeps/engine/schema';
import { Adapter, astar } from 'xxscreeps/utility/astar';

export type World = Map<string, TypeOf<typeof roomTerrain>>;
let world: World;
let worldWidth: number;
let worldHeight: number;

/**
 * List all exits available from the room with the given name.
 * @param roomName The room name.
 */
function describeExits(roomName: string) {
	const info = world.get(roomName);
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
 * Find route from the given room to another room.
 * @param fromRoom Start room name or room object.
 * @param toRoom Finish room name or room object.
 * @param opts An object with the following options:
 *   `routeCallback` This callback accepts two arguments: function(roomName, fromRoomName). It can
 *   be used to calculate the cost of entering that room. You can use this to do things like
 *   prioritize your own rooms, or avoid some rooms. You can return a floating point cost or
 *   Infinity to block the room.
 */
function findRoute(fromRoom: string | Room, toRoom: string | Room, opts: {
	routeCallback?: (roomName: string, fromRoomName: string) => number;
} = {}) {
	// Sanity check
	const fromName = extractRoomName(fromRoom);
	const toName = extractRoomName(toRoom);
	if (!world.has(fromName) || !world.has(toName)) {
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
		pos => Fn.map(Object.values(describeExits(generateRoomName(pos.rx, pos.ry))), parseRoomName));
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
function getRoomLinearDistance(roomName1: string, roomName2: string, continuous = false) {
	const room1 = parseRoomName(roomName1);
	const room2 = parseRoomName(roomName2);
	const dx = Math.abs(room1.rx - room2.rx);
	const dy = Math.abs(room1.ry - room2.ry);
	if (continuous) {
		return Math.max(
			Math.min(worldWidth - dx, dx),
			Math.min(worldHeight - dy, dy),
		);
	}
	return Math.max(dx, dy);
}

/**
 * Get terrain type at the specified room position. This method works for any room in the world even
 * if you have no access to it.
 * @deprecated
 */
export function getTerrainAt(position: RoomPosition): string | undefined;
export function getTerrainAt(xx: number, yy: number, roomName: string): string | undefined;
export function getTerrainAt(...args: [ RoomPosition ] | [ number, number, string ]) {
	const position = args.length === 1 ? args[0] : new RoomPosition(args[0], args[1], args[2]);
	const info = world.get(position.roomName);
	if (info) {
		return info.terrain._getType(position.x, position.y);
	}
}

/**
 * Get a `Room.Terrain` object which provides fast access to static terrain data. This method works
 * for any room in the world even if you have no access to it.
 * @param roomName The room name.
 */
export function getRoomTerrain(roomName: string) {
	return world.get(roomName)!.terrain;
}

export function loadTerrainFromBuffer(worldTerrainBlob: Readonly<Uint8Array>) {
	loadTerrainFromWorld(readWorld(worldTerrainBlob));
}

export function loadTerrainFromWorld(loadedWorld: World) {
	world = loadedWorld;
	let maxX = -Infinity, minX = Infinity;
	let maxY = -Infinity, minY = Infinity;
	for (const roomName of world.keys()) {
		const room = parseRoomName(roomName);
		maxX = Math.max(room.rx, maxX);
		minX = Math.min(room.rx, minX);
		maxY = Math.max(room.ry, maxY);
		minY = Math.min(room.ry, minY);
	}
	worldWidth = maxX - minX;
	worldHeight = maxY - minY;
}

export default { describeExits, findRoute, getRoomLinearDistance, getRoomTerrain, getTerrainAt };

function extractRoomName(room: string | Room) {
	if (typeof room === 'object') {
		return room.name;
	} else {
		return room;
	}
}

//
// Schema
const roomTerrain = struct({
	exits: 'uint8',
	terrain: Terrain.format,
});
export const schema = build(declare('World', compose(vector(struct({
	name: 'string',
	info: roomTerrain,
})), {
	compose: world => new Map(world.map(room => [ room.name, room.info ])),
	decompose: (world: World) => {
		const vector = [ ...Fn.map(world.entries(), ([ name, info ]) => ({ name, info })) ];
		vector.sort((left, right) => left.name.localeCompare(right.name));
		return vector;
	},
})));

export const readWorld = makeReader(schema);
