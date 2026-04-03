import type { TypeOf } from 'xxscreeps/schema/index.js';
import { build } from 'xxscreeps/engine/schema/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { generateRoomName, parseRoomName } from 'xxscreeps/game/position.js';
import { Variant, array, declare, enumerated, makeWriter, optional, struct, variant, vector } from 'xxscreeps/schema/index.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';

// Declare schema and types
const color = optional('string');
const fill = optional('string');
const line = {
	lineStyle: optional(enumerated(undefined, 'dashed', 'dotted')),
	opacity: optional('double'),
};
const stroke = {
	stroke: optional('string'),
	strokeWidth: optional('double'),
};

type LineStyle = Partial<TypeOf<typeof lineSchema>['s']>;
const lineSchema = struct({
	...variant('l'),
	x1: 'double',
	y1: 'double',
	x2: 'double',
	y2: 'double',
	s: struct({
		...line,
		color,
		width: optional('double'),
	}),
});

type CircleStyle = Partial<TypeOf<typeof circleSchema>['s']>;
const circleSchema = struct({
	...variant('c'),
	x: 'double',
	y: 'double',
	s: struct({
		...line,
		...stroke,
		fill,
		radius: optional('double'),
	}),
});

type RectStyle = Partial<TypeOf<typeof rectSchema>['s']>;
const rectSchema = struct({
	...variant('r'),
	x: 'double',
	y: 'double',
	w: 'double',
	h: 'double',
	s: struct({
		...line,
		...stroke,
		fill,
	}),
});

export type PolyStyle = Partial<TypeOf<typeof polySchema>['s']>;
const polySchema = struct({
	...variant('p'),
	points: vector(array(2, 'double')),
	s: struct({
		...line,
		...stroke,
		fill,
	}),
});

type TextStyle = Partial<TypeOf<typeof textSchema>['s']>;
const textSchema = struct({
	...variant('t'),
	x: 'double',
	y: 'double',
	text: 'string',
	s: struct({
		...stroke,
		align: optional('string'),
		backgroundColor: color,
		backgroundPadding: optional('double'),
		color,
		font: optional('string'),
		opacity: optional('double'),
	}),
});

const visualSchema = variant(lineSchema, circleSchema, rectSchema, polySchema, textSchema);
export type VisualEntry = TypeOf<typeof visualSchema>;
export const schema = build(declare('Visual', vector(visualSchema)));
const writeSchema = makeWriter(schema);

// Extract either x/y pair or RoomPosition to x/y pair
type LocalPoint = {
	x: number;
	y: number;
};
type RoomPoint = LocalPoint & {
	roomName: string;
};

function encodeRoomPosition(pos: RoomPoint) {
	const { rx, ry } = parseRoomName(pos.roomName);
	return { x: rx + pos.x / 50, y: ry + pos.y / 50 };
}

export function decodeRoomPosition(coord: { x: number; y: number }) {
	const rx = Math.trunc(coord.x);
	const ry = Math.trunc(coord.y);
	return {
		n: generateRoomName(rx, ry),
		x: Math.round((coord.x - rx) * 50),
		y: Math.round((coord.y - ry) * 50),
	};
}

function *extractPositions(args: any[], includeRoom: boolean): Iterable<any> {
	for (const arg of args) {
		if (typeof arg.x === 'number') {
			const point = includeRoom ? encodeRoomPosition(arg) : arg;
			yield point.x;
			yield point.y;
		} else {
			yield arg;
		}
	}
}

// Per-room visual state. `size` tracks cumulative serialized bytes for limit enforcement
// (500 KB per room, 1000 KB for map). Shared across all RoomVisual instances for the same room.
type RoomVisualState = { visuals: VisualEntry[]; size: number };
const tickVisuals = new Map<string, RoomVisualState>();

// Save visuals to schema blob
export function flush() {
	const result = [ ...Fn.map(tickVisuals, ([ roomName, entry ]) => ({
		roomName,
		blob: writeSchema(entry.visuals),
	})) ];
	tickVisuals.clear();
	return result;
}

/**
 * Base class for room and map visuals. The `Point` type parameter constrains which position
 * argument forms are accepted: `RoomVisual` accepts bare `x, y` pairs, `LocalPoint`, or
 * `RoomPoint`; `MapVisual` accepts only `RoomPoint`.
 */
class VisualOf<Point extends unknown[]> {
	readonly #state;
	readonly #encodePositions;
	readonly #limit;
	readonly #description;

	constructor(description: string, options: {
		state: RoomVisualState;
		limit: number;
		encodePositions: boolean;
	}) {
		this.#description = description;
		this.#state = options.state;
		this.#limit = options.limit;
		this.#encodePositions = options.encodePositions;
	}

	/**
	 * Export the visuals as a string
	 */
	export() {
		return `${this.#state.visuals.map(vis => JSON.stringify({ ...vis, t: vis[Variant] })).join('\n')}\n`;
	}

	/**
	 * Import visuals from string
	 */
	import(text: string) {
		for (const row of text.split('\n')) {
			if (row === '') continue;
			const data = JSON.parse(row);
			const type = data.t;
			delete data.t;
			this.#push({ [Variant]: type, ...data, s: data.s ?? {} });
		}
		return this;
	}

	/**
	 * Draw a circle.
	 */
	circle(...args: [ ...pos: Point, style?: CircleStyle ]) {
		const [ x, y, style ] = extractPositions(args, this.#encodePositions);
		this.#push({ [Variant]: 'c', x, y, s: style ?? {} });
		return this;
	}

	/**
	 * Draw a line.
	 */
	line(...args: [ ...pos1: Point, ...pos2: Point, style?: LineStyle ]) {
		const [ x1, y1, x2, y2, style ] = extractPositions(args, this.#encodePositions);
		this.#push({ [Variant]: 'l', x1, y1, x2, y2, s: style ?? {} });
		return this;
	}

	/**
	 * Draw a polyline.
	 */
	poly(points: (LocalPoint | RoomPoint | [number, number])[], style?: PolyStyle) {
		const pairs = [
			...Fn.map(points, point =>
				Array.isArray(point)
					? point :
					[ ...extractPositions([ point ], this.#encodePositions) ] as [ number, number ]),
		];
		this.#push({ [Variant]: 'p', points: pairs, s: style ?? {} } as VisualEntry);
		return this;
	}

	/**
	 * Draw a rectangle.
	 */
	rect(...args: [ ...pos: Point, width: number, height: number, style?: RectStyle ]) {
		const [ x, y, width, height, style ] = extractPositions(args, this.#encodePositions);
		this.#push({ [Variant]: 'r', x, y, w: width, h: height, s: style ?? {} });
		return this;
	}

	/**
	 * Draw a text label. You can use any valid Unicode characters, including emoji.
	 */
	text(text: string, ...args: [ ...pos: Point, style?: TextStyle ]) {
		const [ x, y, style ] = extractPositions(args, this.#encodePositions);
		this.#push({ [Variant]: 't', x, y, text, s: style ?? {} });
		return this;
	}

	/**
	 * Remove all visuals from the room.
	 */
	clear() {
		this.#state.visuals.splice(0);
		this.#state.size = 0;
	}

	/**
	 * Get the stored size of all visuals added in the current tick.
	 * @returns The size of the visuals in bytes.
	 */
	getSize() {
		return this.#state.size;
	}

	#push(visual: VisualEntry) {
		const entrySize = JSON.stringify(visual).length + 9;
		if (this.#state.size + entrySize > this.#limit) {
			throw new Error(`${this.#description} size has exceeded ${this.#limit >> 10} KB limit`);
		}
		this.#state.visuals.push(visual);
		this.#state.size += entrySize;
	}
}

/**
 * Room visuals provide a way to show various visual debug info in game rooms. You can use the
 * `RoomVisual` object to draw simple shapes that are visible only to you. Every existing Room
 * object already contains the visual property, but you also can create new `RoomVisual` objects for
 * any room (even without visibility) using the constructor.
 *
 * Room visuals are not stored in the database, their only purpose is to display something in your
 * browser. All drawings will persist for one tick and will disappear if not updated. All
 * `RoomVisual` API calls have no added CPU cost (their cost is natural and mostly related to simple
 * `JSON.serialize` calls). However, there is a usage limit: you cannot post more than 500 KB of
 * serialized data per one room (see `getSize` method).
 *
 * All draw coordinates are measured in game coordinates and centered to tile centers, i.e. (10,10)
 * will point to the center of the creep at `x:10; y:10` position. Fractional coordinates are
 * allowed.
 */
export class RoomVisual extends VisualOf<[ x: number, y: number ] | [ pos: LocalPoint ] | [ pos: RoomPoint ]> {
	/**
	 * You can directly create new RoomVisual object in any room, even if it's invisible to your
	 * script.
	 * @param roomName The room name. If undefined, visuals will be posted to all rooms
	 * simultaneously.
	 */
	constructor(roomName = '*') {
		super(`RoomVisual in room ${roomName}`, {
			state: getOrSet(tickVisuals, roomName, () => ({ visuals: [], size: 0 })),
			limit: 500 << 10,
			encodePositions: false,
		});
	}
}

/**
 * Map visuals provide a way to show various visual debug info on the game map. You can use the
 * `MapVisual` object to draw simple shapes that are visible only to you.
 *
 * Map visuals are not stored in the database, their only purpose is to display something in your
 * browser. All drawings will persist for one tick and will disappear if not updated. All
 * `MapVisual` API calls have no added CPU cost (their cost is natural and mostly related to simple
 * `JSON.serialize` calls). However, there is a usage limit: you cannot post more than 1000 KB of
 * serialized data (see `getSize` method).
 */
export class MapVisual extends VisualOf<[ pos: RoomPoint ]> {
	constructor() {
		super('MapVisual', {
			state: getOrSet(tickVisuals, 'map', () => ({ visuals: [], size: 0 })),
			limit: 1000 << 10,
			encodePositions: true,
		});
	}
}
