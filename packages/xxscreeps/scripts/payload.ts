import type { PayloadCodec, PayloadObject } from './symbols.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { RoomObject } from 'xxscreeps/game/object.js';
import type { Terrain } from 'xxscreeps/game/terrain.js';
import { compositeComparator, mappedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { nonNullPredicate } from 'xxscreeps/functional/predicate.js';
import * as C from 'xxscreeps/game/constants/index.js';
import * as MapSchema from 'xxscreeps/game/map.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { parseRoomName } from 'xxscreeps/game/room/name.js';
import { TerrainWriter, packExits } from 'xxscreeps/game/terrain.js';
import { computeRoomMeta } from 'xxscreeps/mods/modern/sector/terrain.js';
import { makeWriter } from 'xxscreeps/schema/write.js';
import { hooks } from './symbols.js';
import 'xxscreeps:mods/game';
import 'xxscreeps:mods/terrain';

/** One room of a payload: 50 lines of 50 characters, plus metadata for the markers among them. */
export interface PayloadRoom {
	layout: string[];
	objects?: PayloadObject[];
}

/** An authored world: every room's terrain and objects, by room name. */
export type Payload = Record<string, PayloadRoom>;

/** A parsed payload, ready to write into a shard. */
export interface PayloadWorld {
	rooms: Room[];
	terrain: Readonly<Uint8Array>;
}

// Index 3 is wall+swamp, which reads back as wall: `Terrain.get` documents three values, and
// `packExits` would read anything else as a border opening.
const terrainMask = [ ' ', '#', ',', '?' ];
const terrainValues = [ 0, C.TERRAIN_MASK_WALL, C.TERRAIN_MASK_SWAMP, C.TERRAIN_MASK_WALL ];

// Codecs by the character they own. A marker colliding with terrain or with another mod's would
// silently take over that character's tiles on import, so it fails here instead.
const codecs = function() {
	const byMarker = new Map<string, PayloadCodec>();
	for (const codec of hooks.map('payload')) {
		if (codec.marker.length !== 1) {
			throw new Error(`Payload marker '${codec.marker}' must be one character`);
		} else if (terrainMask.includes(codec.marker)) {
			throw new Error(`Payload marker '${codec.marker}' is reserved for terrain`);
		} else if (byMarker.has(codec.marker)) {
			throw new Error(`Payload marker '${codec.marker}' is registered twice`);
		}
		byMarker.set(codec.marker, codec);
	}
	return byMarker;
}();

// Objects no codec claims -- creeps, roads, anything a payload doesn't carry -- yield undefined and
// leave their tile's terrain showing.
function encodeObject(object: RoomObject) {
	return Fn.find(Fn.map(codecs.values(), codec => {
		const fields = codec.encode(object);
		return fields === undefined ? undefined : { marker: codec.marker, meta: { id: object.id, ...fields } };
	}), nonNullPredicate);
}

async function exportRoom(shard: Shard, roomName: string, terrain: Terrain): Promise<PayloadRoom> {
	const room = await shard.loadRoom(roomName);
	const objects = Fn.pipe(
		room['#objects'],
		$$ => Fn.map($$, object => {
			const encoded = encodeObject(object);
			return encoded === undefined ? undefined : [ `${object.pos.x},${object.pos.y}`, encoded ] as const;
		}),
		$$ => Fn.filter($$),
		$$ => new Map($$));
	// Metadata rides the layout's scan order and nothing else, so both come off one resolved array.
	const cells = [ ...Fn.map(Fn.range(50), yy => [ ...Fn.map(Fn.range(50), xx => {
		const object = objects.get(`${xx},${yy}`);
		return { marker: object?.marker ?? terrainMask[terrain.get(xx, yy)], meta: object?.meta };
	}) ]) ];
	const layout = cells.map(row => row.map(cell => cell.marker).join(''));
	const metadata = Fn.pipe(
		cells,
		$$ => Fn.transform($$, row => Fn.map(row, cell => cell.meta)),
		$$ => Fn.filter($$),
		$$ => [ ...$$ ]);
	return { layout, ...metadata.length > 0 && { objects: metadata } };
}

/**
 * Renders every room of `shard` as a terrain layout, with each object a registered codec claims
 * folded in as that codec's character plus an entry in the room's metadata.
 */
export async function exportPayload(shard: Shard): Promise<Payload> {
	const world = await shard.loadWorld();
	// Sort map so that rooms will be continuous in the JSON top to bottom, left to right.
	const rooms = [ ...world.entries() ].sort(compositeComparator<readonly [ string, Terrain ]>([
		mappedNumericComparator(([ roomName ]) => parseRoomName(roomName).rx),
		mappedNumericComparator(([ roomName ]) => parseRoomName(roomName).ry),
	]));
	return Fn.fromEntries(await Fn.mapAwait(rooms, async ([ roomName, terrain ]) => [
		roomName,
		await exportRoom(shard, roomName, terrain),
	] as const));
}

function importRoom(roomName: string, info: PayloadRoom) {
	const terrain = new TerrainWriter();
	const room = new Room();
	room.name = roomName;
	const metadata = (info.objects ?? []).values();
	for (const [ yy, line ] of info.layout.entries()) {
		for (const [ xx, character ] of [ ...line as Iterable<string> ].entries()) {
			const value = terrainValues[terrainMask.indexOf(character)];
			if (value !== undefined) {
				terrain.set(xx, yy, value);
				continue;
			}
			const codec = codecs.get(character);
			if (codec === undefined) {
				throw new Error(`Room ${roomName} holds unregistered character '${character}'`);
			}
			const meta = metadata.next().value;
			if (meta === undefined) {
				throw new Error(`Room ${roomName} holds more markers than metadata`);
			}
			terrain.set(xx, yy, C.TERRAIN_MASK_WALL);
			const decoded = codec.decode(meta, room);
			const objects = Array.isArray(decoded) ? decoded : [ decoded ] as const;
			objects[0].id = meta.id;
			for (const object of objects) {
				object.pos = new RoomPosition(xx, yy, roomName);
				object['#posId'] = object.pos['#id'];
				room['#insertObject'](object);
			}
		}
	}
	room['#flushObjects'](null);
	return { room, terrain };
}

/**
 * Rebuilds every room a payload describes, along with the world terrain blob a shard's `terrain`
 * key holds. Performs no storage I/O; the caller saves what it needs.
 */
export function importPayload(payload: Payload): PayloadWorld {
	const parsedRooms = Object.entries(payload).map(([ roomName, info ]) => importRoom(roomName, info));
	const roomNames = new Set(Fn.map(parsedRooms, ({ room }) => room.name));
	const terrainMap = new Map(Fn.map(parsedRooms, ({ room, terrain }) => [
		room.name, {
			exits: packExits(terrain),
			terrain,
			...computeRoomMeta(room.name, roomNames),
		},
	]));
	return {
		rooms: parsedRooms.map(({ room }) => room),
		terrain: makeWriter(MapSchema.schema)(terrainMap),
	};
}

/**
 * Writes a parsed world into a shard at tick zero. Both room buffers are filled because a caller
 * may skip the processor's room-initialization stage, which is what fills the second one in a
 * running server.
 */
export async function seedShard(shard: Shard, { rooms, terrain }: PayloadWorld) {
	shard.time = 0;
	await Promise.all([
		shard.data.set('terrain', terrain),
		shard.data.set('time', shard.time),
		shard.data.sAdd('rooms', rooms.map(room => room.name)),
		Fn.mapAwait(rooms, async room => {
			await shard.saveRoom(room.name, shard.time, room);
			await shard.copyRoomFromPreviousTick(room.name, shard.time + 1);
		}),
	]);
}
