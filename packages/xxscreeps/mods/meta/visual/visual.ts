import type { LocalPosition, PositionLike } from 'xxscreeps/game/position.js';
import type { WithShapeAndType } from 'xxscreeps/schema/format.js';
import type { ShapeOf, TypeOf } from 'xxscreeps/schema/index.js';
import { build } from 'xxscreeps/engine/schema/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { makeRoomName, parseRoomName } from 'xxscreeps/game/room/name.js';
import { Variant, array, declare, enumerated, makeWriter, optional, struct, variant, vector } from 'xxscreeps/schema/index.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';

type PointAsTuple = [ xx: number, yy: number ];
type PointParameter = PointAsTuple | [ pos: LocalPosition ] | [ pos: PositionLike ];

// Declare schema and types
const color = {
	/**
	 * Line color in any web format.
	 * @public
	 * @default #ffffff (white).
	 */
	color: optional('string'),
};

const fill = {
	/**
	 * Fill color in any web format.
	 * @public
	 * @default #ffffff (white)
	 */
	fill: optional('string'),
};

const opacity = {
	/**
	 * Opacity value.
	 * @public
	 * @default 0.5
	 */
	opacity: optional('double'),
};

const line = {
	...opacity,

	/**
	 * Either `undefined` (solid line), `dashed`, or `dotted`.
	 * @public
	 * @default undefined
	 */
	lineStyle: optional(enumerated(undefined, 'dashed', 'dotted')),
};

const stroke = {
	/**
	 * Stroke color in any web format.
	 * @public
	 * @default undefined (no stroke)
	 */
	stroke: optional('string'),

	/**
	 * Stroke line width.
	 * @public
	 * @default 0.1 (0.5 for map visuals)
	 */
	strokeWidth: optional('double'),
};

/** @public */
export interface LineStyle extends Partial<TypeOf<typeof lineSchema>['s']> {}
const lineSchema = struct({
	...variant('l'),
	x1: 'double',
	y1: 'double',
	x2: 'double',
	y2: 'double',
	s: struct({
		...color,
		...line,

		/**
		 * Line width.
		 * @public
		 * @default 0.1
		 */
		width: optional('double'),
	}),
});

/** @public */
export interface CircleStyle extends Partial<TypeOf<typeof circleSchema>['s']> {}
const circleSchema = struct({
	...variant('c'),
	x: 'double',
	y: 'double',
	s: struct({
		...fill,
		...line,
		...stroke,

		/**
		 * Circle radius.
		 * @public
		 * @default 0.15 (or 10 for map visuals)
		 */
		radius: optional('double'),
	}),
});

/** @public */
export interface RectStyle extends Partial<TypeOf<typeof rectSchema>['s']> {}
const rectSchema = struct({
	...variant('r'),
	x: 'double',
	y: 'double',
	w: 'double',
	h: 'double',
	s: struct({
		...fill,
		...line,
		...stroke,
	}),
});

/** @public */
export interface PolyStyle extends Partial<TypeOf<typeof polySchema>['s']> {}
const polySchema = struct({
	...variant('p'),
	points: vector(array(2, 'double') as WithShapeAndType<PointAsTuple>),
	s: struct({
		...fill,
		...line,
		...stroke,
	}),
});

/** @public */
export interface TextStyle extends Partial<TypeOf<typeof textSchema>['s']> {}
const textSchema = struct({
	...variant('t'),
	x: 'double',
	y: 'double',
	text: 'string',
	s: struct({
		...color,
		...opacity,
		...stroke,

		/**
		 * Text align, either `center`, `left`, or `right`.
		 * @public
		 * @default center
		 */
		align: optional('string'),

		/**
		 * Background color in any web format. When background is enabled, text vertical align is set to
		 * middle (default is baseline).
		 * @public
		 * @default undefined (no background)
		 */
		backgroundColor: optional('string'),

		/**
		 * Background rectangle padding.
		 * @public
		 * @default 0.3
		 */
		backgroundPadding: optional('double'),

		/**
		 * Either a number or a string in one of the following forms: `0.7` (relative size in game
		 * coordinates), `20px` (absolute size in pixels), `0.7 serif`, or `bold italic 1.5 Times New
		 * Roman`.
		 * @public
		 */
		font: optional('string'),
	}),
});

const visualSchema = variant(lineSchema, circleSchema, rectSchema, polySchema, textSchema);
export type VisualEntry = TypeOf<typeof visualSchema>;
type VisualEntryShape = ShapeOf<typeof visualSchema>;
export const schema = build(declare('Visual', vector(visualSchema)));
const writeSchema = makeWriter(schema);

// Extract either x/y pair or RoomPosition to x/y pair
function encodeRoomPosition(pos: PositionLike): LocalPosition {
	const { rx, ry } = parseRoomName(pos.roomName);
	return { x: rx + pos.x / 50, y: ry + pos.y / 50 };
}

export function decodeRoomPosition(coord: LocalPosition) {
	const rx = Math.floor(coord.x);
	const ry = Math.floor(coord.y);
	return {
		n: makeRoomName(rx, ry),
		x: Math.round((coord.x - rx) * 50),
		y: Math.round((coord.y - ry) * 50),
	};
}

// Strip leading `LocalPosition` to `PointAsTuple` and leave the rest at the end.
type ExtractPositions<Args extends readonly unknown[]> =
	Args extends readonly [ infer First, ...infer Rest ]
		? First extends LocalPosition
			? [ ...PointAsTuple, ...ExtractPositions<Rest> ]
			: [ First, ...ExtractPositions<Rest> ]
		: Args;

function extractPositions<Args extends readonly unknown[]>(args: Args, includeRoom: boolean): ExtractPositions<Args>;
function *extractPositions(args: unknown[], includeRoom: boolean) {
	for (const arg of args) {
		const position = arg as Partial<PositionLike>;
		if (typeof position.x === 'number') {
			const point = includeRoom ? encodeRoomPosition(position as PositionLike) : position as LocalPosition;
			yield point.x;
			yield point.y;
		} else {
			yield arg;
		}
	}
}

// Per-room visual state. `size` tracks cumulative serialized bytes for limit enforcement
// (500 KB per room, 1000 KB for map). Shared across all RoomVisual instances for the same room.
type RoomVisualState = { visuals: VisualEntryShape[]; size: number };
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
 * argument forms are accepted: `RoomVisual` accepts bare `x, y` pairs, `LocalPosition`, or
 * `PositionLike`; `MapVisual` accepts only `PositionLike`.
 */
class VisualOf<Point extends PointParameter> {
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
	 * Returns a compact representation of all visuals added in the room, or on the map, in the
	 * current tick.
	 * @returns A string with visuals data. There's not much you can do with the string besides store
	 * them for later.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomVisual.export
	 * @see https://docs.screeps.com/api/#Game.map-visual.export
	 */
	export() {
		return `${this.#state.visuals.map(vis => JSON.stringify({ ...vis, t: vis[Variant] })).join('\n')}\n`;
	}

	/**
	 * Add previously exported (with `export`) visuals to the visual data of the current tick.
	 * @param text The string returned from `export`.
	 * @returns The visual object itself, so that you can chain calls.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomVisual.import
	 * @see https://docs.screeps.com/api/#Game.map-visual.import
	 */
	import(text: string) {
		type SerializedVisual = Partial<VisualEntryShape> & { t?: string };
		for (const row of text.split('\n')) {
			if (row === '') continue;
			const data = JSON.parse(row) as SerializedVisual;
			const type = data.t;
			delete data.t;
			// @ts-expect-error
			this.#push({ [Variant]: type, ...data, s: data.s ?? {} });
		}
		return this;
	}

	/**
	 * Draw a circle.
	 * @param pos The position object of the center. Room visuals also accept two `x, y` coordinate
	 * arguments instead.
	 * @param style An object of {@link CircleStyle}.
	 * @returns The visual object itself, so that you can chain calls.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomVisual.circle
	 * @see https://docs.screeps.com/api/#Game.map-visual.circle
	 */
	circle(...args: [ ...pos: Point, style?: CircleStyle ]) {
		type Signature = [ pos: LocalPosition, style?: CircleStyle ];
		const [ xx, yy, style ] = extractPositions(args as Signature, this.#encodePositions);
		this.#push({ [Variant]: 'c', x: xx, y: yy, s: style ?? {} });
		return this;
	}

	/**
	 * Draw a line.
	 * @param pos1 The start position object. Room visuals also accept two `x1, y1` coordinate
	 * arguments instead.
	 * @param pos2 The finish position object. Room visuals also accept two `x2, y2` coordinate
	 * arguments instead.
	 * @param style An object of {@link LineStyle}.
	 * @returns The visual object itself, so that you can chain calls.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomVisual.line
	 * @see https://docs.screeps.com/api/#Game.map-visual.line
	 */
	line(...args: [ ...pos1: Point, ...pos2: Point, style?: LineStyle ]) {
		type Signature = [ pos1: LocalPosition, pos2: LocalPosition, style?: LineStyle ];
		const [ x1, y1, x2, y2, style ] = extractPositions(args as Signature, this.#encodePositions);
		this.#push({ [Variant]: 'l', x1, y1, x2, y2, s: style ?? {} });
		return this;
	}

	/**
	 * Draw a polyline.
	 * @param points An array of points. Every item should be either an array with 2 numbers (i.e.
	 * `[10,15]`), or a `RoomPosition` object. Map visuals require `RoomPosition` objects.
	 * @param style An object of {@link PolyStyle}.
	 * @returns The visual object itself, so that you can chain calls.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomVisual.poly
	 * @see https://docs.screeps.com/api/#Game.map-visual.poly
	 */
	poly(points: (LocalPosition | PositionLike | PointAsTuple)[], style?: PolyStyle) {
		const pairs = Fn.pipe(
			points,
			$$ => Fn.map($$, (point): PointAsTuple =>
				Array.isArray(point)
					? point
					: [ ...extractPositions([ point ] as const, this.#encodePositions) ]),
			$$ => [ ...$$ ]);
		this.#push({ [Variant]: 'p', points: pairs, s: style ?? {} });
		return this;
	}

	/**
	 * Draw a rectangle.
	 * @param pos The position object of the top-left corner. Room visuals also accept two `x, y`
	 * coordinate arguments instead.
	 * @param width The width of the rectangle.
	 * @param height The height of the rectangle.
	 * @param style An object of {@link RectStyle}.
	 * @returns The visual object itself, so that you can chain calls.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomVisual.rect
	 * @see https://docs.screeps.com/api/#Game.map-visual.rect
	 */
	rect(...args: [ ...pos: Point, width: number, height: number, style?: RectStyle ]) {
		type Signature = [ pos: LocalPosition, width: number, height: number, style?: RectStyle ];
		const [ xx, yy, width, height, style ] = extractPositions(args as Signature, this.#encodePositions);
		this.#push({ [Variant]: 'r', x: xx, y: yy, w: width, h: height, s: style ?? {} });
		return this;
	}

	/**
	 * Draw a text label. You can use any valid Unicode characters, including
	 * [emoji](http://unicode.org/emoji/charts/emoji-style.txt).
	 * @param text The text message.
	 * @param pos The position object of the label baseline. Room visuals also accept two `x, y`
	 * coordinate arguments instead.
	 * @param style An object of {@link TextStyle}.
	 * @returns The visual object itself, so that you can chain calls.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomVisual.text
	 * @see https://docs.screeps.com/api/#Game.map-visual.text
	 */
	text(text: string, ...args: [ ...pos: Point, style?: TextStyle ]) {
		type Signature = [ pos: LocalPosition, style?: TextStyle ];
		const [ xx, yy, style ] = extractPositions(args as Signature, this.#encodePositions);
		this.#push({ [Variant]: 't', x: xx, y: yy, text, s: style ?? {} });
		return this;
	}

	/**
	 * Remove all visuals from the room, or from the map.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomVisual.clear
	 * @see https://docs.screeps.com/api/#Game.map-visual.clear
	 */
	clear() {
		this.#state.visuals.splice(0);
		this.#state.size = 0;
	}

	/**
	 * Get the stored size of all visuals added in the current tick. It must not exceed 512,000 (500
	 * KB) per room, or 1,024,000 (1000 KB) for map visuals.
	 * @returns The size of the visuals in bytes.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomVisual.getSize
	 * @see https://docs.screeps.com/api/#Game.map-visual.getSize
	 */
	getSize() {
		return this.#state.size;
	}

	#push(visual: VisualEntryShape) {
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
 * object already contains the [`visual`](https://docs.screeps.com/api/#Room.visual) property, but
 * you also can create new `RoomVisual` objects for any room (even without visibility) using the
 * [constructor](https://docs.screeps.com/api/#RoomVisual.constructor).
 *
 * Room visuals are not stored in the database, their only purpose is to display something in your
 * browser. All drawings will persist for one tick and will disappear if not updated. All
 * `RoomVisual` API calls have no added CPU cost (their cost is natural and mostly related to simple
 * `JSON.serialize` calls). However, there is a usage limit: you cannot post more than 500 KB of
 * serialized data per one room (see [`getSize`](https://docs.screeps.com/api/#RoomVisual.getSize)
 * method).
 *
 * All draw coordinates are measured in game coordinates and centered to tile centers, i.e. (10,10)
 * will point to the center of the creep at `x:10; y:10` position. Fractional coordinates are
 * allowed.
 * @public
 * @see https://docs.screeps.com/api/#RoomVisual
 */
export class RoomVisual extends VisualOf<PointParameter> {
	/**
	 * You can directly create new `RoomVisual` object in any room, even if it's invisible to your
	 * script.
	 * @param roomName The room name. If undefined, visuals will be posted to all rooms
	 * simultaneously.
	 * @public
	 * @see https://docs.screeps.com/api/#RoomVisual.constructor
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
 * `Game.map.visual` object to draw simple shapes that are visible only to you.
 *
 * Map visuals are not stored in the database, their only purpose is to display something in your
 * browser. All drawings will persist for one tick and will disappear if not updated. All
 * `Game.map.visual` calls have no added CPU cost (their cost is natural and mostly related to
 * simple `JSON.serialize` calls). However, there is a usage limit: you cannot post more than 1000
 * KB of serialized data (see `getSize` method).
 *
 * All draw coordinates are measured in global game coordinates
 * ([`RoomPosition`](https://docs.screeps.com/api/#RoomPosition)).
 * @public
 * @see https://docs.screeps.com/api/#Game-map-visual
 */
export class MapVisual extends VisualOf<[ pos: PositionLike ]> {
	constructor() {
		super('MapVisual', {
			state: getOrSet(tickVisuals, 'map', () => ({ visuals: [], size: 0 })),
			limit: 1000 << 10,
			encodePositions: true,
		});
	}
}
