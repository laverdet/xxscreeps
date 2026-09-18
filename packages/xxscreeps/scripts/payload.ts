import type { PayloadCodec, PayloadObject } from './symbols.js';
import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { RoomObject } from 'xxscreeps/game/object.js';
import type { Terrain } from 'xxscreeps/game/terrain.js';
import { compositeComparator, mappedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
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

/** An export, plus a tally of what it couldn't carry. */
export interface ExportedPayload {
	payload: Payload;
	/** How many objects no codec claimed, by class name. */
	dropped: Map<string, number>;
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
// leave their tile's terrain showing. A codec's null is an object it carries in a companion's
// entry: it earns no marker of its own, but the payload does bring it back.
function encodeObject(object: RoomObject) {
	return Fn.find(Fn.map(codecs.values(), codec => {
		const fields = codec.encode(object);
		return fields == null ? fields : { marker: codec.marker, meta: { id: object.id, ...fields } };
	}), encoded => encoded !== undefined);
}

async function exportRoom(shard: Shard, roomName: string, terrain: Terrain) {
	const room = await shard.loadRoom(roomName);
	// The layout and the drop tally read one encode pass; a second would re-run every codec.
	const encodings = [ ...Fn.map(room['#objects'], object => ({ object, encoded: encodeObject(object) })) ];
	const objects = Fn.pipe(
		encodings,
		$$ => Fn.map($$, ({ object, encoded }) =>
			encoded == null ? undefined : [ `${object.pos.x},${object.pos.y}`, encoded ] as const),
		$$ => Fn.filter($$),
		$$ => new Map($$));
	const dropped = Fn.pipe(
		encodings,
		$$ => Fn.filter($$, ({ encoded }) => encoded === undefined),
		$$ => Fn.map($$, ({ object }) => object.constructor.name),
		$$ => [ ...$$ ]);
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
	return { payload: { layout, ...metadata.length > 0 && { objects: metadata } }, dropped };
}

/**
 * Renders every room of `shard` as a terrain layout, with each object a registered codec claims
 * folded in as that codec's character plus an entry in the room's metadata. Objects no codec
 * claims are absent from the payload and counted in `dropped`.
 */
export async function exportPayload(shard: Shard): Promise<ExportedPayload> {
	const world = await shard.loadWorld();
	// Sort map so that rooms will be continuous in the JSON top to bottom, left to right.
	const rooms = [ ...world.entries() ].sort(compositeComparator<readonly [ string, Terrain ]>([
		mappedNumericComparator(([ roomName ]) => parseRoomName(roomName).rx),
		mappedNumericComparator(([ roomName ]) => parseRoomName(roomName).ry),
	]));
	const exported = await Fn.mapAwait(rooms, async ([ roomName, terrain ]) =>
		[ roomName, await exportRoom(shard, roomName, terrain) ] as const);
	return {
		payload: Fn.fromEntries(exported, ([ roomName, { payload } ]) => [ roomName, payload ]),
		dropped: Fn.reduce(
			Fn.transform(exported, ([ , { dropped } ]) => dropped),
			new Map<string, number>(),
			(counts, name) => counts.set(name, (counts.get(name) ?? 0) + 1)),
	};
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
export function importPayload(payload: Payload) {
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
