import type { AnyRoomObject } from './room.js';
import type { PositionParameter } from 'xxscreeps/game/position.js';
import type { UnwrapArray } from 'xxscreeps/utility/types.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomPosition, fetchPositionArgument, iterateArea } from 'xxscreeps/game/position.js';
import { terrainMaskToString } from 'xxscreeps/game/terrain.js';
import { extend } from 'xxscreeps/utility/utility.js';
import { Room } from './room.js';
import { lookConstants } from './symbols.js';

// All LOOK_ constants
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Look {}
export type LookConstants = LookInfo['look'] | typeof C.LOOK_TERRAIN;

// Converts a LOOK_ constant to result type
export type TypeOfLook<Look extends LookConstants> = Extract<LookInfo, { look: Look }>['type'];

// Union of LOOK_ constants with the result type included
type LookInfo = Exclude<UnwrapArray<Look[keyof Look]>, void> | {
	look: 'terrain';
	type: 'plain' | 'swamp' | 'wall';
};

// Result of `room.lookAt` and  `room.lookAtArea`,
type LookAtResult<Type extends LookConstants> = Record<LookConstants, TypeOfLook<Type>> & {
	type: Type;
};

// Helpers for `room.lookAtArea` and `room.lookForAtArea`
interface LookArrayPos { x: number; y: number }
type LookAsArray<Type> = (Type & LookArrayPos)[];
type LookAtArea<Type> = Record<number, Record<number, Type[]>>;

// Result of `room.lookForAtArea`. This is the same as `LookAtResult` but without `type`
type LookForAtArea<Type extends LookConstants> = Record<LookConstants, TypeOfLook<Type>>;
interface LookEntry {
	[key: string]: unknown;
	type: string;
}
interface LookAreaEntry extends LookEntry {
	x: number;
	y: number;
}

declare module './room.js' {
	interface Room {
		/**
		 * Get the list of objects at the specified room position.
		 * @param type One of the `LOOK_*` constants
		 * @param x X position in the room
		 * @param y Y position in the room
		 * @param target Can be a RoomObject or RoomPosition
		 */
		lookAt: (...args: PositionParameter) => LookAtResult<any>[];

		/**
		 * Creates a RoomPosition object at the specified location.
		 */
		getPositionAt: (x: number, y: number) => RoomPosition;

		/**
		 * Get the list of objects at the specified room area.
		 * @param top The top Y boundary of the area.
		 * @param left The left X boundary of the area.
		 * @param bottom The bottom Y boundary of the area.
		 * @param right The right X boundary of the area.
		 * @param asArray Set to true if you want to get the result as a plain array.
		 */
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		lookAtArea(top: number, left: number, bottom: number, right: number, asArray?: false): LookAtArea<LookAtResult<any>>;
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		lookAtArea(top: number, left: number, bottom: number, right: number, asArray: boolean): LookAsArray<LookAtResult<any>>;

		/**
		 * Get an object with the given type at the specified room position.
		 * @param type One of the `LOOK_*` constants
		 * @param x X position in the room
		 * @param y Y position in the room
		 * @param target Can be a RoomObject or RoomPosition
		 */
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		lookForAt<Type extends LookConstants>(type: Type, ...rest: PositionParameter): TypeOfLook<Type>[];
		// TypeScript can't figure out the rest parameter above which causes the `extend` below to fail.
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		lookForAt(type: LookConstants, x: number, y: number): never[];

		/**
		 * Get the list of objects with the given type at the specified room area.
		 * @param type One of the `LOOK_*` constants.
		 * @param top The top Y boundary of the area.
		 * @param left The left X boundary of the area.
		 * @param bottom The bottom Y boundary of the area.
		 * @param right The right X boundary of the area.
		 * @param asArray Set to true if you want to get the result as a plain array.
		 */
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		lookForAtArea<Type extends LookConstants>(type: Type, top: number, left: number, bottom: number, right: number, asArray?: false): LookAtArea<LookForAtArea<Type>>;
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		lookForAtArea<Type extends LookConstants>(type: Type, top: number, left: number, bottom: number, right: number, asArray: boolean): LookAsArray<LookForAtArea<Type>>;
	}
}

extend(Room, {
	lookAt(...args: PositionParameter) {
		const { pos } = fetchPositionArgument(this.name, ...args);
		if (pos?.roomName !== this.name) {
			return [];
		}
		return [
			...Fn.transform(this['#lookAt'](pos), lookAtEntries),
			{ type: 'terrain', terrain: terrainMaskToString[this.getTerrain().get(pos.x, pos.y)] },
		] as never;
	},

	lookAtArea(top: number, left: number, bottom: number, right: number, asArray = false) {
		const size = (bottom - top + 1) * (right - left + 1);
		const objects: Iterable<AnyRoomObject> = (() => {
			if (size < this['#objects'].length) {
				// Iterate all objects
				return Fn.filter(this['#objects'], (object): object is AnyRoomObject =>
					object['#lookType'] !== null &&
					object.pos.x >= left && object.pos.x <= right &&
					object.pos.y >= top && object.pos.y <= bottom);
			} else {
				// Filter on spatial index
				return Fn.pipe(
					iterateArea(this.name, top, left, bottom, right),
					$$ => Fn.map($$, pos => this['#lookAt'](pos)),
					$$ => Fn.concat($$));
			}
		})();
		const terrain = this.getTerrain();
		const results = Fn.concat([
			// Iterate objects
			Fn.transform(objects, object => lookAtAreaEntries(object)),
			// Add terrain data
			// eslint-disable-next-line id-length
			mapArea(top, left, bottom, right, (x, y) =>
				({ x, y, type: 'terrain', terrain: terrainMaskToString[terrain.get(x, y)] })),
		]);
		return withAsArray(results, top, left, bottom, right, asArray, true,
			({ x: _x, y: _y, ...rest }) => rest) as never;
	},

	lookForAt(type: LookConstants, ...rest: PositionParameter) {
		const { pos } = fetchPositionArgument(this.name, ...rest);
		if (pos?.roomName !== this.name) {
			return [];
		}
		if (type === C.LOOK_TERRAIN) {
			return [ terrainMaskToString[this.getTerrain().get(pos.x, pos.y)] ];
		}
		if (!lookConstants.has(type)) {
			return [] as any;
			// TODO: Set this back once all game objects have been implemented (?)
			// return C.ERR_INVALID_ARGS as any;
		}
		return [ ...Fn.filter(this['#lookAt'](pos), object => lookMatches(type, object)) ];
	},

	lookForAtArea(type: LookConstants, top: number, left: number, bottom: number, right: number, asArray = false) {
		const size = (bottom - top + 1) * (right - left + 1);
		if (type === C.LOOK_TERRAIN) {
			// Simply return terrain data
			const terrain = this.getTerrain();
			// eslint-disable-next-line id-length
			const results = mapArea(top, left, bottom, right, (x, y) =>
				({ x, y, terrain: terrainMaskToString[terrain.get(x, y)] }));
			return withAsArray(results, top, left, bottom, right, asArray, false, value => value.terrain) as never;
		} else {
			const objects = (() => {
				const objects = this['#lookFor'](type);
				if (size < objects.length) {
					// Iterate all objects by type
					return Fn.filter(objects, object =>
						object.pos.x >= left && object.pos.x <= right &&
						object.pos.y >= top && object.pos.y <= bottom);
				} else {
					// Filter on spatial index
					return Fn.pipe(
						iterateArea(this.name, top, left, bottom, right),
						$$ => Fn.transform($$, pos => this['#lookAt'](pos)),
						$$ => Fn.filter($$, object => lookMatches(type, object)));
				}
			})();
			// Add position and type information
			const results = Fn.map(objects, object => ({ x: object.pos.x, y: object.pos.y, [type]: object }));
			return withAsArray(results, top, left, bottom, right, asArray, false, value => value[type]) as never;
		}
	},

	getPositionAt(xx: number, yy: number) {
		return new RoomPosition(xx, yy, this.name);
	},
});

function *mapArea<Type>(top: number, left: number, bottom: number, right: number, fn: (xx: number, yy: number) => Type): Iterable<Type> {
	for (let yy = top; yy <= bottom; ++yy) {
		for (let xx = left; xx <= right; ++xx) {
			yield fn(xx, yy);
		}
	}
}

function lookMatches(type: LookConstants, object: AnyRoomObject) {
	return object['#lookType'] === type || object['#secondaryLookType'] === type;
}

function *lookAtEntries(object: AnyRoomObject): Iterable<LookEntry> {
	const secondaryLookType = object['#secondaryLookType'];
	if (secondaryLookType !== null) {
		yield { type: secondaryLookType, [secondaryLookType]: object };
	}
	const type = object['#lookType'];
	yield { type, [type]: object };
}

function *lookAtAreaEntries(object: AnyRoomObject): Iterable<LookAreaEntry> {
	const secondaryLookType = object['#secondaryLookType'];
	if (secondaryLookType !== null) {
		yield { x: object.pos.x, y: object.pos.y, type: secondaryLookType, [secondaryLookType]: object };
	}
	const type = object['#lookType'];
	yield { x: object.pos.x, y: object.pos.y, type, [type]: object };
}

function withAsArray<T extends LookArrayPos>(
	values: Iterable<T>,
	top: number, left: number, bottom: number, right: number,
	asArray: boolean, nest: boolean,
	extract: (value: T) => any,
) {
	if (asArray) {
		return [ ...values ];
	} else {
		const results: LookAtArea<any> = {};
		for (let yy = top; yy <= bottom; ++yy) {
			const row: Record<number, any[]> = results[yy] = {};
			if (nest) {
				for (let xx = left; xx <= right; ++xx) {
					row[xx] = [];
				}
			}
		}
		if (nest) {
			for (const value of values) {
				results[value.y]![value.x]!.push(extract(value));
			}
		} else {
			for (const value of values) {
				(results[value.y]![value.x] ??= []).push(extract(value));
			}
		}
		return results;
	}
}
