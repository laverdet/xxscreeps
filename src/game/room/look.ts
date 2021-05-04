import type { UnwrapArray } from 'xxscreeps/utility/types';
import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import { extend } from 'xxscreeps/utility/utility';
import { LookType } from 'xxscreeps/game/object';
import type { PositionParameter } from 'xxscreeps/game/position';
import { RoomPosition, fetchPositionArgument } from 'xxscreeps/game/position';
import { iterateArea } from 'xxscreeps/game/position/direction';
import { terrainMaskToString } from 'xxscreeps/game/terrain';
import { LookAt, LookFor, Objects, lookConstants } from './symbols';
import { Room } from './room';

// All LOOK_ constants
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
type LookAtResult<Type extends LookConstants> = {
	[key in LookConstants]: TypeOfLook<Type>;
} & {
	type: Type;
};

// Helpers for `room.lookAtArea` and `room.lookForAtArea`
type LookAsArray<Type> = (Type & { x: number; y: number })[];
type LookAtArea<Type> = Record<number, Record<number, Type[]>>;

// Result of `room.lookForAtArea`. This is the same as `LookAtResult` but without `type`
type LookForAtArea<Type extends LookConstants> = {
	[key in LookConstants]: TypeOfLook<Type>;
};

declare module './room' {
	interface Room {
		/**
		 * Get the list of objects at the specified room position.
		 * @param type One of the `LOOK_*` constants
		 * @param x X position in the room
		 * @param y Y position in the room
		 * @param target Can be a RoomObject or RoomPosition
		 */
		lookAt(...args: PositionParameter): LookAtResult<any>[];

		/**
		 * Get the list of objects at the specified room area.
		 * @param top The top Y boundary of the area.
		 * @param left The left X boundary of the area.
		 * @param bottom The bottom Y boundary of the area.
		 * @param right The right X boundary of the area.
		 * @param asArray Set to true if you want to get the result as a plain array.
		 */
		lookAtArea(top: number, left: number, bottom: number, right: number, asArray?: false): LookAtArea<LookAtResult<any>>;
		lookAtArea(top: number, left: number, bottom: number, right: number, asArray: boolean): LookAsArray<LookAtResult<any>>;

		/**
		 * Get an object with the given type at the specified room position.
		 * @param type One of the `LOOK_*` constants
		 * @param x X position in the room
		 * @param y Y position in the room
		 * @param target Can be a RoomObject or RoomPosition
		 */
		lookForAt<Type extends LookConstants>(type: Type, ...rest: PositionParameter): TypeOfLook<Type>[];
		// TypeScript can't figure out the rest parameter above which causes the `extend` below to fail.
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
		lookForAtArea<Type extends LookConstants>(type: Type, top: number, left: number, bottom: number, right: number, asArray?: false): LookAtArea<LookForAtArea<Type>>;
		lookForAtArea<Type extends LookConstants>(type: Type, top: number, left: number, bottom: number, right: number, asArray: boolean): LookAsArray<LookForAtArea<Type>>;

		/**
		 * Creates a RoomPosition object at the specified location.
		 */
		getPositionAt(x: number, y: number): RoomPosition;
	}
}

extend(Room, {
	lookAt(...args: PositionParameter) {
		const { pos } = fetchPositionArgument(this.name, ...args);
		if (!pos || pos.roomName !== this.name) {
			return [];
		}
		return [
			...Fn.map(this[LookAt](pos), object => {
				const type = object[LookType];
				return { type, [type]: object };
			}),
			{ type: 'terrain', terrain: terrainMaskToString[this.getTerrain().get(pos.x, pos.y)] },
		] as never;
	},

	lookAtArea(top: number, left: number, bottom: number, right: number, asArray = false) {
		const size = (bottom - top + 1) * (right - left + 1);
		const objects: Iterable<any> = (() => {
			if (size < this[Objects].length) {
				// Iterate all objects
				return Fn.filter(this[Objects], object =>
					object.pos.x >= left && object.pos.x <= right &&
					object.pos.y >= top && object.pos.y <= bottom);
			} else {
				// Filter on spatial index
				return Fn.concat(Fn.map(iterateArea(this.name, top, left, bottom, right), pos => this[LookAt](pos)));
			}
		})();
		const terrain = this.getTerrain();
		const results = Fn.concat(
			// Iterate objects
			Fn.map(objects, object => {
				const type = object[LookType];
				return { x: object.pos.x, y: object.pos.y, type, [type]: object };
			}),
			// Add terrain data
			mapArea(top, left, bottom, right, (x, y) =>
				({ x, y, type: 'terrain', terrain: terrainMaskToString[terrain.get(x, y)] })));
		return withAsArray(results, top, left, bottom, right, asArray, true) as never;
	},

	lookForAt(type: LookConstants, ...rest: PositionParameter) {
		const { pos } = fetchPositionArgument(this.name, ...rest);
		if (!pos || pos.roomName !== this.name) {
			return [];
		}
		if (type === C.LOOK_TERRAIN) {
			return [ terrainMaskToString[this.getTerrain().get(pos.x, pos.y)] ];
		}
		if (!lookConstants.has(type)) {
			return C.ERR_INVALID_ARGS as any;
		}
		return [ ...Fn.filter(this[LookAt](pos), object => object[LookType] === type) ];
	},

	lookForAtArea(type: LookConstants, top: number, left: number, bottom: number, right: number, asArray = false) {
		const size = (bottom - top + 1) * (right - left + 1);
		const results = (() => {
			if (type === C.LOOK_TERRAIN) {
				// Simply return terrain data
				const terrain = this.getTerrain();
				return mapArea(top, left, bottom, right, (x, y) =>
					({ x, y, terrain: terrainMaskToString[terrain.get(x, y)] }));
			} else {
				const objects = (() => {
					const objects = this[LookFor](type);
					if (size < objects.length) {
						// Iterate all objects by type
						return Fn.filter(objects, object =>
							object.pos.x >= left && object.pos.x <= right &&
							object.pos.y >= top && object.pos.y <= bottom);
					} else {
						// Filter on spatial index
						return Fn.concat(Fn.map(iterateArea(this.name, top, left, bottom, right), pos =>
							Fn.filter(this[LookAt](pos), object => object[LookType] === type)));
					}
				})();
				// Add position and type information
				return Fn.map(objects, object => ({ x: object.pos.x, y: object.pos.y, [type]: object }));
			}
		})();
		return withAsArray(results, top, left, bottom, right, asArray, false) as never;
	},

	getPositionAt(x: number, y: number) {
		return new RoomPosition(x, y, this.name);
	},
});

function *mapArea<Type>(top: number, left: number, bottom: number, right: number, fn: (xx: number, yy: number) => Type): Iterable<Type> {
	for (let yy = top; yy <= bottom; ++yy) {
		for (let xx = left; xx <= right; ++xx) {
			yield fn(xx, yy);
		}
	}
}

function withAsArray(values: Iterable<{ x: number; y: number }>, top: number, left: number, bottom: number, right: number, asArray: boolean, nest: boolean) {
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
		for (const value of values) {
			(results[value.y][value.x] ??= []).push(value);
		}
		return results;
	}
}
