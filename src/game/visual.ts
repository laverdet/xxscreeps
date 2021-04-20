import * as Fn from 'xxscreeps/utility/functional';
import { array, declare, enumerated, makeWriter, optional, struct, variant, vector, TypeOf, Variant } from 'xxscreeps/schema';
import { build } from 'xxscreeps/engine/schema';
import { registerGlobal } from '.';
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

type PolyStyle = Partial<TypeOf<typeof polySchema>['s']>;
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
	}),
});

const visualSchema = variant(lineSchema, circleSchema, rectSchema, polySchema, textSchema);

export const schema = build(declare('Visual', vector(struct({
	name: 'string',
	visual: vector(variant(lineSchema, circleSchema, rectSchema, polySchema, textSchema)),
}))));

// Clear visuals at the end of the tick
export function clear() {
	tickVisuals.clear();
}

// Save to visuals to schema blob
export function write() {
	if (tickVisuals.size) {
		const mapped = Fn.map(tickVisuals.entries(), entry => ({
			name: entry[0],
			visual: entry[1],
		}));
		return writeSchema(mapped as (typeof mapped extends Iterable<infer T> ? T[] : never));
	}
}
const writeSchema = makeWriter(schema);

// Extract either x/y pair or RoomPosition to x/y pair
type Point = [ pos: { x: number; y: number } ] | [ x: number, y: number ];
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
export class RoomVisual {
	#visuals;
	constructor(roomName: string) {
		const tmp = getOrSet(tickVisuals, roomName, () => []);
		this.#visuals = tmp; // typescript bug
	}

	/**
	 * Draw a circle.
	 */
	circle(...args: [ ...pos: Point, style?: CircleStyle ]) {
		const [ x, y, style ] = extractPositions(args);
		this.#visuals.push({ [Variant]: 'c', x, y, s: style ?? {} });
		return this;
	}

	/**
	 * Draw a line.
	 */
	line(...args: [ ...pos1: Point, ...pos2: Point, style?: LineStyle ]) {
		const [ x1, y1, x2, y2, style ] = extractPositions(args);
		this.#visuals.push({ [Variant]: 'l', x1, y1, x2, y2, s: style ?? {} });
		return this;
	}

	/**
	 * Draw a polyline.
	 */
	poly(points: ([ x: number, y: number ] | { x: number; y: number })[], style?: PolyStyle) {
		// TODO: Spread needed because Schema types are incomplete
		const filtered = [ ...Fn.filter(Fn.map(points, (point): [ number, number ] =>
			Array.isArray(point) ? [ point[0], point[1] ] : [ point.x, point.y ])) ];
		this.#visuals.push({ [Variant]: 'p', points: filtered, s: (style as any) ?? {} });
		return this;
	}

	/**
	 * Draw a rectangle.
	 */
	rect(...args: [ ...pos: Point, width: number, height: number, style?: RectStyle ]) {
		const [ x, y, width, height, style ] = extractPositions(args);
		this.#visuals.push({ [Variant]: 'r', x, y, w: width, h: height, s: style ?? {} });
		return this;
	}

	/**
	 * Draw a text label. You can use any valid Unicode characters, including emoji.
	 */
	text(text: string, ...args: [ ...pos: Point, style?: TextStyle ]) {
		const [ x, y, style ] = extractPositions(args);
		this.#visuals.push({ [Variant]: 't', x, y, text, s: style ?? {} });
		return this;
	}

	/**
	 * Remove all visuals from the room.
	 */
	clear() {
		this.#visuals.splice(0, this.#visuals.length);
	}

	/**
	 * Not implemented!
	 */
	getSize() {
		return Infinity;
	}
}

// Export `RoomVisual` to runtime globals
registerGlobal(RoomVisual);
declare module 'xxscreeps/game/runtime' {
	interface Global { RoomVisual: typeof RoomVisual }
}
