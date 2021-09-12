import type { TypeOf } from 'xxscreeps/schema';
import * as Fn from 'xxscreeps/utility/functional';
import { Variant, declare, enumerated, makeWriter, optional, struct, variant, vector } from 'xxscreeps/schema';
import { build } from 'xxscreeps/engine/schema';
import { getOrSet } from 'xxscreeps/utility/utility';

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
	n1: optional('string'),
	x2: 'double',
	y2: 'double',
	n2: optional('string'),
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
	n: optional('string'),
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
	n: optional('string'),
	s: struct({
		...line,
		...stroke,
		fill,
	}),
});

export type PolyStyle = Partial<TypeOf<typeof polySchema>['s']>;
const polySchema = struct({
	...variant('p'),
	// to allow room names for map visuals the points have to be saved in a less optimal way as objects.
	// the vanilla screeps server allows sending the points as objects or [x,y][] array
	points: vector(struct({ x: 'double', y: 'double', n: optional('string') })),
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
	n: optional('string'),
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
export const schema = build(declare('Visual', vector(visualSchema)));

// Save to visuals to schema blob
export function flush() {
	const result = [ ...Fn.map(tickVisuals, ([ roomName, visual ]) => ({
		roomName,
		blob: writeSchema(visual),
	})) ];
	tickVisuals.clear();
	return result;
}
const writeSchema = makeWriter(schema);

// Extract either x/y pair or RoomPosition to x/y pair
type Point = [ pos: { x: number; y: number; roomName: string } ] | [ x: number, y: number ];
function *extractPositions(args: any[]) {
	for (const arg of args) {
		if (typeof arg.x === 'number') {
			yield arg.x;
			yield arg.y;
		} else {
			yield arg;
		}
	}
}

const tickVisuals = new Map<string, TypeOf<typeof visualSchema>[]>();

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
export class RoomVisual {
	#visuals;
	readonly #map;

	/**
	 * You can directly create new RoomVisual object in any room, even if it's invisible to your
	 * script.
	 * @param roomName The room name. If undefined, visuals will be posted to all rooms
	 * simultaneously.
	 */
	constructor(roomName = '*') {
		this.#visuals = getOrSet(tickVisuals, roomName, () => []);
		this.#map = roomName === 'map';
	}

	/**
	 * Export the visuals as a string
	 */
	export() {
		return `${this.#visuals.map(vis => JSON.stringify({ ...vis, t: vis[Variant] })).join('\n')}\n`;
	}

	/**
	 * Import visuals from string
	 */
	import(text: string) {
		for (const row of text.split('\n')) {
			if (!row) continue;
			const data = JSON.parse(row);
			const type = data.t;
			delete data.t;
			this.#visuals.push({ [Variant]: type, ...data, s: data.s || {} });
		}
		return this;
	}

	/**
	 * Draw a circle.
	 */
	circle(...args: [ ...pos: Point, style?: CircleStyle ]) {
		const [ x, y, style ] = extractPositions(args);
		const n = this.#map ? (args[0] as any).roomName : undefined;
		this.#visuals.push({ [Variant]: 'c', x, y, n, s: style ?? {} });
		return this;
	}

	/**
	 * Draw a line.
	 */
	line(...args: [ ...pos1: Point, ...pos2: Point, style?: LineStyle ]) {
		const [ x1, y1, x2, y2, style ] = extractPositions(args);
		const n1 = this.#map ? (args[0] as any).roomName : undefined;
		const n2 = this.#map ? (args[1] as any).roomName : undefined;
		this.#visuals.push({ [Variant]: 'l', x1, y1, n1, x2, y2, n2, s: style ?? {} });
		return this;
	}

	/**
	 * Draw a polyline.
	 */
	poly(points: ([ x: number, y: number ] | { x: number; y: number; roomName?: string })[], style?: PolyStyle) {
		// TODO: Spread needed because Schema types are incomplete
		const filtered = [ ...Fn.filter(Fn.map(points, (point): { x: number; y: number; n: string | undefined } =>
			Array.isArray(point) ? { x: point[0], y: point[1], n: undefined } : { x: point.x, y: point.y, n: this.#map ? point.roomName : undefined })) ];
		this.#visuals.push({ [Variant]: 'p', points: filtered, s: (style as any) ?? {} });
		return this;
	}

	/**
	 * Draw a rectangle.
	 */
	rect(...args: [ ...pos: Point, width: number, height: number, style?: RectStyle ]) {
		const [ x, y, width, height, style ] = extractPositions(args);
		const n = this.#map ? (args[0] as any).roomName : undefined;
		this.#visuals.push({ [Variant]: 'r', x, y, n, w: width, h: height, s: style ?? {} });
		return this;
	}

	/**
	 * Draw a text label. You can use any valid Unicode characters, including emoji.
	 */
	text(text: string, ...args: [ ...pos: Point, style?: TextStyle ]) {
		const [ x, y, style ] = extractPositions(args);
		const n = this.#map ? (args[0] as any).roomName : undefined;
		this.#visuals.push({ [Variant]: 't', x, y, n, text, s: style ?? {} });
		return this;
	}

	/**
	 * Remove all visuals from the room.
	 */
	clear() {
		this.#visuals.splice(0);
	}

	/**
	 * Not implemented!
	 */
	getSize() {
		return Infinity;
	}
}
