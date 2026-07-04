import type { ExitType } from './room/find.js';
import type { Room } from './room/index.js';
import type { TypeOf } from 'xxscreeps/schema/index.js';
import type { Adapter } from 'xxscreeps/utility/astar.js';

import { build, structForPath } from 'xxscreeps/engine/schema/index.js';
import { primitiveComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { makeRoomName, parseRoomName, roomNameFormat } from 'xxscreeps/game/room/name.js';
import { compose, declare, makeReader, optional, struct, vector } from 'xxscreeps/schema/index.js';
import { astar } from 'xxscreeps/utility/astar.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';
import * as C from './constants/index.js';
import { getDirection, getOffsetsFromDirection } from './direction.js';
import { RoomPosition } from './position.js';
import * as Terrain from './terrain.js';

// Schema
const roomTerrain = () => struct({
	exits: 'uint8',
	terrain: Terrain.format,
});
// Authored world geometry, extensible by mods through the `RoomMeta` path (the World reader is
// built at module load, so a registrant must be evaluated before this module). A sector is
// anchored on the one room that carries its record — the center room is in charge of the ring.
export interface Schema {}
const roomMeta = () => struct(structForPath<Schema>()('RoomMeta', {
	sector: optional(struct({
		// The highway ring at range 5, shared with adjacent sectors.
		edges: vector(roomNameFormat),
		// The 9x9 interior at range <= 4, the center itself included; exclusive to this sector.
		members: vector(roomNameFormat),
	})),
}));

interface RoomEntry {
	info: TypeOf<typeof roomTerrain>;
	meta: TypeOf<typeof roomMeta>;
}
type SectorRecord = NonNullable<RoomEntry['meta']['sector']>;

export const schema = build(declare('World', compose(vector(struct({
	name: 'string',
	info: roomTerrain,
	meta: roomMeta,
})), {
	compose: world => new Map(world.map(room => [ room.name, { info: room.info, meta: room.meta } ])),
	decompose: (world: Map<string, RoomEntry>) => {
		const vector = [ ...Fn.map(world.entries(), ([ name, { info, meta } ]) => ({ name, info, meta })) ];
		vector.sort((left, right) => primitiveComparator(left.name, right.name));
		return vector;
	},
})));

type TerrainByRoom = TypeOf<typeof schema>;

type FindRoute = {
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
 */
export class GameMap {
	readonly #terrain: TerrainByRoom;
	readonly #accessibleRooms;
	readonly #left;
	readonly #top;
	readonly #height;
	readonly #width;
	// room -> the sector centers that register it; built from the stored records on first
	// `getSectorCenters`.
	#sectorCentersIndex: Map<string, string[]> | undefined;

	constructor(terrain: TerrainByRoom, accessibleRooms?: ReadonlySet<string>) {
		this.#terrain = terrain;
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

	'#getCenterRoom'() {
		return makeRoomName(this.#left + Math.floor(this.#width / 2), this.#top + Math.floor(this.#height / 2));
	}

	/** The sector record anchored on this room, or `undefined` when the room is not a sector center. */
	getSector(roomName: string): SectorRecord | undefined {
		return this.#terrain.get(roomName)?.meta.sector;
	}

	/** The sector centers this room is registered to — one (member), up to four (edge), or none. */
	getSectorCenters(roomName: string): string[] {
		return (this.#sectorCentersIndex ??= this.#buildSectorCentersIndex()).get(roomName) ?? [];
	}

	/** Every sector in the world, keyed by the center room that owns it. */
	*sectors(): IterableIterator<[ center: string, sector: SectorRecord ]> {
		for (const [ roomName, entry ] of this.#terrain) {
			const { sector } = entry.meta;
			if (sector !== undefined) {
				yield [ roomName, sector ];
			}
		}
	}

	/**
	 * List all exits available from the room with the given name.
	 * @param roomName The room name.
	 */
	describeExits(roomName: string): ExitsDescriptor | null {
		const entry = this.#terrain.get(roomName);
		if (entry) {
			const room = parseRoomName(roomName);
			return Fn.pipe(
				[ C.TOP, C.RIGHT, C.BOTTOM, C.LEFT ],
				$$ => Fn.reject($$, direction => (entry.info.exits & (2 ** ((direction - 1) >>> 1))) === 0),
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
	 * @param opts An object with the pathfinding options. See `findRoute`.
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

	/** @internal */
	getRoomStatus(roomName: string, actually: true): RoomStatus | undefined;

	/**
	 * Gets availability status of the room with the specified name. Learn more about starting areas
	 * from [this article](https://docs.screeps.com/start-areas.html).
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
		} else if (!actually || this.#terrain.has(roomName)) {
			return { status: 'closed', timestamp: null };
		} else {
			return undefined;
		}
	}

	/** @internal */
	getRoomTerrain(roomName: string, graceful: true): Terrain.Terrain | undefined;

	/**
	 * Get a `Room.Terrain` object which provides fast access to static terrain data. This method works
	 * for any room in the world even if you have no access to it.
	 * @param roomName The room name.
	 */
	getRoomTerrain(roomName: string): Terrain.Terrain;

	getRoomTerrain(roomName: string, graceful?: boolean) {
		const terrain = this.#terrain.get(roomName)?.info.terrain;
		if (terrain) {
			return terrain;
		} else if (!graceful) {
			throw new Error(`Could not access room ${roomName}`);
		}
	}

	/**
	 * Get terrain type at the specified room position. This method works for any room in the world even
	 * if you have no access to it.
	 * @deprecated
	 */
	getTerrainAt(...args: [ position: RoomPosition ] | [ x: number, y: number, roomName: string ]) {
		const pos = args.length === 1 ? args[0] : new RoomPosition(args[0], args[1], args[2]);
		const entry = this.#terrain.get(pos.roomName);
		if (entry) {
			return Terrain.terrainMaskToString[entry.info.terrain.get(pos.x, pos.y)];
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
	isRoomAvailable(roomName: string) {
		return this.#accessibleRooms.has(roomName);
	}

	#buildSectorCentersIndex(): Map<string, string[]> {
		const centers = new Map<string, string[]>();
		for (const [ center, sector ] of this.sectors()) {
			for (const roomName of Fn.concat([ sector.members, sector.edges ])) {
				getOrSet(centers, roomName, () => []).push(center);
			}
		}
		return centers;
	}
}

/**
 * Runtime information about the current shard / world
 */
export class World {
	map: GameMap;
	name;
	terrain: TerrainByRoom;
	terrainBlob;

	constructor(name: string, terrainBlob: Readonly<Uint8Array>, accessibleRooms?: ReadonlySet<string>) {
		this.name = name;
		this.terrainBlob = terrainBlob;
		this.terrain = reader(terrainBlob);
		this.map = new GameMap(this.terrain, accessibleRooms);
	}

	/**
	 * Returns an iterator of all rooms and terrain.
	 */
	entries(): Iterable<[ string, Terrain.Terrain ]> {
		return Fn.map(this.terrain, ([ roomName, entry ]) => [ roomName, entry.info.terrain ]);
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
