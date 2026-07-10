import type * as pf from '#pf';

export interface Options {
	flee?: boolean | undefined;
	heuristicWeight?: number | undefined;
	maxCost?: number | undefined;
	maxOps?: number | undefined;
	maxRooms?: number | undefined;
	plainCost?: number | undefined;
	swampCost?: number | undefined;
}

export interface Goal {
	pos: number;
	range: number;
}

export type MakePosition<Position> = (xx: number, yy: number) => Position;
export type RoomCallback = (roomId: number) => Uint8Array | false | undefined;

/**
 * `roomId` format is little-endian packed integer type:
 *
 *     struct { u8 rx, ry }
 *     roomId = (ry << 8) | rx
 *
 * W0N0 = { rx: 0x7f, ry: 0x7f }
 * E0S0 = { rx: 0x80, ry: 0x80 }
 * W0N0 = { rx: 0x7f, ry: 0x7f }
 * W0S0 = { rx: 0x7f, ry: 0x80 }
 */
export type WorldTerrain = IteratorObject<readonly [ number, Readonly<Uint8Array> ]>;

export interface Result<Position> {
	path: Position[];
	ops: number;
	cost: number;
	incomplete: boolean;
}

export type LoadTerrain = (world: WorldTerrain) => void;

export const makeLoadTerrain = (
	loadTerrain: typeof pf.loadTerrain,
	save: (terrain: unknown) => void,
): LoadTerrain =>
	world => {
		const terrain = [ ...world.map(([ room, terrain ]) => ({ room, terrain })) ];
		// We must ensure that the terrain data is not garbage collected. The easiest way to make that
		// happen is to reexport it. This is handled by each module individually.
		save(terrain);
		loadTerrain(terrain);
	};

/**
 * `position` format is little-endian backed "world position" type:
 *
 *     struct { u16 wx, wy; };
 *     wx = rx * 50 + xx;
 *     wy = ry * 50 + yy;
 *     position = (yy << 16) | xx
 *
 * RoomPosition(0, 0, 'W127N127') = { wx: 0, wy: 0 }
 * RoomPosition(49, 49, 'E127S127') = { xx: 12799, yy: 12799 }
 */
export type Search = <Position>(
	origin: number,
	goals: readonly Goal[],
	roomCallback: RoomCallback | undefined,
	makePosition: MakePosition<Position>,
	options: Options,
) => Result<Position>;

export const makeSearch = (search: typeof pf.search): Search =>
	(origin, goals, roomCallback, makePosition, options) => {

		// Short circuit if there are no goals
		if (goals.length === 0) {
			return { path: [], ops: 0, cost: 0, incomplete: false };
		}

		// Extract and cast options
		const plainCost = Number(options.plainCost ?? 1) | 0;
		const swampCost = Number(options.swampCost ?? 5) | 0;
		const heuristicWeight = Number(options.heuristicWeight) || 1.2;
		const maxOps = Number(options.maxOps ?? 0x7fffffff) | 0;
		const maxCost = Number(options.maxCost ?? 0x7fffffff) | 0;
		const maxRooms = Number(options.maxRooms ?? 16) | 0;
		const flee = Boolean(options.flee);

		// Invoke native code
		const ret = search(
			origin, goals,
			roomCallback,
			plainCost, swampCost,
			maxRooms, maxOps, maxCost,
			flee,
			heuristicWeight,
		);

		// Translate results
		return {
			...ret,
			path: makeCompletePath(makePosition, ret.path),
		};
	};

function makeCompletePath<Type>(make: MakePosition<Type>, path: readonly number[]): Type[] {
	const iterable = function*() {
		const first = path[0];
		if (first !== undefined) {
			let xx = first & 0xffff;
			let yy = first >> 16;
			yield make(xx, yy);
			for (let ii = 1; ii < path.length; ++ii) {
				const next = path[ii]!;
				const nx = next & 0xffff;
				const ny = next >> 16;
				const dx = Math.sign(nx - xx);
				const dy = Math.sign(ny - yy);
				while (nx !== xx || ny !== yy) {
					xx += dx;
					yy += dy;
					yield make(xx, yy);
				}
			}
		}
	}();
	const result = [ ...iterable ];
	result.pop();
	return result.reverse();
}
