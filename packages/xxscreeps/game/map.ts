import type { ExitType } from './room/find.js';
import type { Room } from './room/index.js';
import type { TypeOf } from 'xxscreeps/schema/index.js';
import type { Adapter } from 'xxscreeps/utility/astar.js';
import { build, makeUpgrader, structForPath } from 'xxscreeps/engine/schema/index.js';
import { primitiveComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { makeRoomName, parseRoomName, roomLinearDistance, roomNameFormat } from 'xxscreeps/game/room/name.js';
import { compose, declare, makeReader, makeWriter, optional, struct, vector } from 'xxscreeps/schema/index.js';
import { astar } from 'xxscreeps/utility/astar.js';
import * as C from './constants/index.js';
import { getDirection, getOffsetsFromDirection } from './direction.js';
import { RoomPosition } from './position.js';
import * as Terrain from './terrain.js';

// Room metadata, extensible by mods through the `RoomMeta` path.
// TODO: The World reader is built at module load, so a registrant must be evaluated before this
// module.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Schema {}
const roomIntrinsics = () => struct(...structForPath<Schema>()('RoomIntrinsics', {
	exits: 'uint8',
	terrain: Terrain.format,
	// TODO: mods/sector
	sectors: vector(roomNameFormat),
	sectorControl: optional(struct({
		// The highway ring at range 5, shared with adjacent sectors.
		edges: vector(roomNameFormat),
		// The 9x9 interior at range <= 4, the center itself included; exclusive to this sector.
		members: vector(roomNameFormat),
	})),
}));

export type SectorControl = NonNullable<TypeOf<typeof roomIntrinsics>['sectorControl']>;

export const schema = build(declare('World', compose(vector(struct({
	name: 'string',
	info: roomIntrinsics,
})), {
	compose: world => new Map(world.map(room => [ room.name, room.info ])),
	decompose: (world: Map<string, TypeOf<typeof roomIntrinsics>>) => {
		const vector = [ ...Fn.map(world.entries(), ([ name, info ]) => ({ name, info })) ];
		vector.sort((left, right) => primitiveComparator(left.name, right.name));
		return vector;
	},
})));

type RoomTraitsByName = TypeOf<typeof schema>;

type FindRoute = {
	/**
	 * This callback accepts two arguments: `function(roomName, fromRoomName)`. It can be used to
	 * calculate the cost of entering that room. You can use this to do things like prioritize your
	 * own rooms, or avoid some rooms. You can return a floating point cost or `Infinity` to block the
	 * room.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.map.findRoute
	 */
	routeCallback?: (roomName: string, fromRoomName: string) => number;
};

type RoomStatus = RoomClosed | NormalRoom;
type ExitsDescriptor = Record<typeof C.TOP | typeof C.RIGHT | typeof C.BOTTOM | typeof C.LEFT, string>;

interface RoomClosed {
	status: 'closed';
	timestamp: number | null;
}

interface NormalRoom {
	status: 'normal';
	timestamp: number | null;
}

/**
 * A global object representing world map. Use it to navigate between rooms.
 * @public
 * @see https://docs.screeps.com/api/#Game-map
 */
export class GameMap {
	readonly #traits: RoomTraitsByName;
	readonly #accessibleRooms;
	readonly #left;
	readonly #top;
	readonly #height;
	readonly #width;

	constructor(terrain: RoomTraitsByName, accessibleRooms?: ReadonlySet<string>) {
		this.#traits = terrain;
		this.#accessibleRooms = accessibleRooms ?? new Set(terrain.keys());
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
		this.#left = minX;
		this.#top = minY;
		// Inclusive room counts; `getWorldSize()` and the continuous-wrap math in `getRoomLinearDistance` consume these directly.
		this.#width = maxX - minX + 1;
		this.#height = maxY - minY + 1;
	}

	/** @internal */
	'#getCenterRoom'() {
		return makeRoomName(this.#left + Math.floor(this.#width / 2), this.#top + Math.floor(this.#height / 2));
	}

	/** @internal */
	'#getRoomTraits'(roomName: string) {
		const traits = this.#traits.get(roomName);
		if (!traits) {
			throw new Error(`Could not access room ${roomName}`);
		}
		return traits;
	}

	/** @internal */
	*'#sectors'(): IterableIterator<[ center: string, sector: SectorControl ]> {
		for (const [ roomName, entry ] of this.#traits) {
			const { sectorControl } = entry;
			if (sectorControl) {
				yield [ roomName, sectorControl ];
			}
		}
	}

	/**
	 * List all exits available from the room with the given name.
	 * @param roomName The room name.
	 * @returns The exits information in the format `{ "1": "W8N4", "3": "W7N3", "5": "W8N2", "7":
	 * "W9N3" }` where the keys are the `TOP`, `RIGHT`, `BOTTOM` and `LEFT` direction constants, or
	 * `null` if the room not found.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.map.describeExits
	 */
	describeExits(roomName: string): ExitsDescriptor | null {
		const entry = this.#traits.get(roomName);
		if (entry) {
			const room = parseRoomName(roomName);
			return Fn.pipe(
				[ C.TOP, C.RIGHT, C.BOTTOM, C.LEFT ],
				$$ => Fn.reject($$, direction => (entry.exits & (2 ** ((direction - 1) >>> 1))) === 0),
				$$ => Fn.map($$, direction => {
					const offsets = getOffsetsFromDirection(direction);
					return [ direction, makeRoomName(room.rx + offsets.dx, room.ry + offsets.dy) ] as const;
				}),
				$$ => Fn.fromEntries($$));
		}
		return null;
	}

	/**
	 * Find the exit direction from the given room en route to another room.
	 * @param fromRoom Start room name or room object.
	 * @param toRoom Finish room name or room object.
	 * @param opts An object with the pathfinding options. See
	 * [`findRoute`](https://docs.screeps.com/api/#Game.map.findRoute).
	 * @returns The room direction constant, one of the following: `FIND_EXIT_TOP`, `FIND_EXIT_RIGHT`,
	 * `FIND_EXIT_BOTTOM`, `FIND_EXIT_LEFT`. Or one of the following error codes: `ERR_NO_PATH`,
	 * `ERR_INVALID_ARGS`
	 * @public
	 * @see https://docs.screeps.com/api/#Game.map.findExit
	 */
	findExit(fromRoom: string | Room, toRoom: string | Room, opts: FindRoute = {}) {
		const route = this.findRoute(fromRoom, toRoom, opts);
		if (typeof route === 'number') {
			return route;
		} else {
			const [ first ] = route;
			if (first === undefined) {
				return C.ERR_INVALID_ARGS;
			} else {
				return first.exit;
			}
		}
	}

	/**
	 * Find route from the given room to another room.
	 * @param fromRoom Start room name or room object.
	 * @param toRoom Finish room name or room object.
	 * @param opts An object with the following options: `routeCallback` This callback accepts two
	 * arguments: `function(roomName, fromRoomName)`. It can be used to calculate the cost of entering
	 * that room. You can use this to do things like prioritize your own rooms, or avoid some rooms.
	 * You can return a floating point cost or `Infinity` to block the room.
	 * @returns The route array in the format `[ { exit: FIND_EXIT_RIGHT, room: 'arena21' }, ... ]`,
	 * or the error code: `ERR_NO_PATH`
	 * @public
	 * @see https://docs.screeps.com/api/#Game.map.findRoute
	 */
	findRoute(fromRoom: string | Room, toRoom: string | Room, opts: FindRoute = {}) {
		// Sanity check
		const fromName = extractRoomName(fromRoom);
		const toName = extractRoomName(toRoom);
		if (!this.#traits.has(fromName) || !this.#traits.has(toName)) {
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
			routeCallback
				? (to, from) => routeCallback(makeRoomName(to.rx, to.ry), makeRoomName(from.rx, from.ry)) :
				() => 1,
			// describeExits is typed `null as never` for player-facing ergonomics but
			// can genuinely return null at runtime; `Object.values(null)` would throw.
			pos => Fn.map(Object.values(this.describeExits(makeRoomName(pos.rx, pos.ry)) ?? {}), parseRoomName));
		if (route) {
			return Fn.pipe(
				route,
				$$ => Fn.scan($$, [ origin, origin ] as const, (prev, next) => [ prev[1], next ] as const),
				$$ => Fn.shift($$).rest ?? [],
				$$ => Fn.map($$, ([ prev, next ]) => ({
					exit: getDirection(next.rx - prev.rx, next.ry - prev.ry) as ExitType,
					room: makeRoomName(next.rx, next.ry),
				})),
				$$ => [ ...$$ ]);
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
	 * @returns A number of rooms between the given two rooms.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.map.getRoomLinearDistance
	 */
	getRoomLinearDistance(roomName1: string, roomName2: string, continuous = false) {
		const room1 = parseRoomName(roomName1);
		const room2 = parseRoomName(roomName2);
		if (continuous) {
			const dx = Math.abs(room1.rx - room2.rx);
			const dy = Math.abs(room1.ry - room2.ry);
			return Math.max(
				Math.min(this.#width - dx, dx),
				Math.min(this.#height - dy, dy),
			);
		} else {
			return roomLinearDistance(room1, room2);
		}
	}

	/** @internal */
	getRoomStatus(roomName: string, actually: true): RoomStatus | undefined;

	/**
	 * Gets availability status of the room with the specified name. Learn more about starting areas
	 * from [this article](https://docs.screeps.com/start-areas.html).
	 * @param roomName The room name.
	 * @returns An object with the following properties: `status` -- one of the following string
	 * values: `normal` (the room has no restrictions), `closed` (the room is not available), `novice`
	 * (the room is part of a novice area), `respawn` (the room is part of a respawn area);
	 * `timestamp` -- status expiration time in milliseconds since UNIX epoch time. This property is
	 * `null` if the status is permanent.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.map.getRoomStatus
	 */
	getRoomStatus(roomName: string): RoomStatus;

	getRoomStatus(roomName: unknown, actually?: boolean): RoomStatus | undefined {
		if (typeof roomName !== 'string') {
			return undefined;
		}
		const room = parseRoomName(roomName);
		if (Number.isNaN(room.rx) || Number.isNaN(room.ry)) {
			return undefined;
		} else if (this.#accessibleRooms.has(roomName)) {
			return { status: 'normal', timestamp: null };
		} else if (!actually || this.#traits.has(roomName)) {
			return { status: 'closed', timestamp: null };
		} else {
			return undefined;
		}
	}

	/** @internal */
	getRoomTerrain(roomName: string, graceful: true): Terrain.Terrain | undefined;

	/**
	 * Get a [`Room.Terrain`](https://docs.screeps.com/api/#Room-Terrain) object which provides fast
	 * access to static terrain data. This method works for any room in the world even if you have no
	 * access to it.
	 * @param roomName The room name.
	 * @returns Returns new [`Room.Terrain`](https://docs.screeps.com/api/#Room-Terrain) object.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.map.getRoomTerrain
	 */
	getRoomTerrain(roomName: string): Terrain.Terrain;

	getRoomTerrain(roomName: string, graceful?: boolean) {
		const terrain = this.#traits.get(roomName)?.terrain;
		if (terrain) {
			return terrain;
		} else if (!graceful) {
			throw new Error(`Could not access room ${roomName}`);
		}
	}

	/**
	 * Get terrain type at the specified room position. This method works for any room in the world
	 * even if you have no access to it.
	 * @param args Either `x` (X position in the room), `y` (Y position in the room) and `roomName`
	 * (the room name), or a single `RoomPosition` object.
	 * @returns One of the following string values: `plain`, `swamp`, `wall`
	 * @public
	 * @deprecated Please use a faster method
	 * [`Game.map.getRoomTerrain`](https://docs.screeps.com/api/#Game.map.getRoomTerrain) instead.
	 * @see https://docs.screeps.com/api/#Game.map.getTerrainAt
	 */
	getTerrainAt(...args: [ position: RoomPosition ] | [ x: number, y: number, roomName: string ]) {
		const pos = args.length === 1 ? args[0] : new RoomPosition(args[0], args[1], args[2]);
		const entry = this.#traits.get(pos.roomName);
		if (entry) {
			return Terrain.terrainMaskToString[entry.terrain.get(pos.x, pos.y)];
		}
	}

	/**
	 * Returns the world size as a number of rooms between world corners. For example, for a world
	 * with rooms from W50N50 to E50S50 this method will return 102.
	 * @public
	 * @see https://docs.screeps.com/api/#Game.map.getWorldSize
	 */
	getWorldSize() {
		return Math.max(this.#height, this.#width);
	}

	/**
	 * Check if the room is available to move into.
	 * @param roomName The room name.
	 * @returns A boolean value.
	 * @public
	 * @deprecated Please use
	 * [`Game.map.getRoomStatus`](https://docs.screeps.com/api/#Game.map.getRoomStatus) instead.
	 * @see https://docs.screeps.com/api/#Game.map.isRoomAvailable
	 */
	isRoomAvailable(roomName: string) {
		return this.#accessibleRooms.has(roomName);
	}
}

/**
 * Runtime information about the current shard / world
 */
export class World {
	map: GameMap;
	name;
	terrain: RoomTraitsByName;
	terrainBlob;

	constructor(name: string, terrainBlob: Readonly<Uint8Array>, accessibleRooms?: ReadonlySet<string>) {
		this.name = name;
		this.terrainBlob = terrainBlob;
		this.terrain = read(terrainBlob);
		this.map = new GameMap(this.terrain, accessibleRooms);
	}

	/**
	 * Returns an iterator of all rooms and terrain.
	 */
	entries(): Iterable<[ string, Terrain.Terrain ]> {
		return Fn.map(this.terrain, ([ roomName, entry ]) => [ roomName, entry.terrain ]);
	}
}

const read = makeReader(schema);
const write = makeWriter(schema);
// Upgrades a terrain blob persisted under an older schema version to the current one, the same way
// room blobs are upgraded on load. Call this on the host when reading terrain from the database
// before constructing `World` or forwarding the blob; the player runtime has no upgrader and always
// receives an already-current blob.
export const upgradeTerrain = makeUpgrader(schema, write);

function extractRoomName(room: string | Room) {
	if (typeof room === 'object') {
		return room.name;
	} else {
		return room;
	}
}
