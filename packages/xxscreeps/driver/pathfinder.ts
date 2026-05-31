import type { World } from 'xxscreeps/game/map.js';
import type { Goal, SearchOptions } from 'xxscreeps/game/pathfinder/index.js';
import type { OneOrMany } from 'xxscreeps/utility/types.js';
import pf from '@xxscreeps/pathfinder';
import { PositionLike, RoomPosition } from 'xxscreeps/game/position.js';
import { makeRoomNameFromId, parseRoomNameToId } from 'xxscreeps/game/room/name.js';
import { getBuffer } from 'xxscreeps/game/terrain.js';
import { clamp } from 'xxscreeps/utility/utility.js';

const makePositionIn: (pos: RoomPosition | PositionLike) => number =
	// eslint-disable-next-line @typescript-eslint/prefer-ts-expect-error
	// @ts-ignore
	pf.version === 11
		? function make(pos) {
			// Assume it is RoomPosition
			const positionInteger = pos['#id'];
			if (positionInteger !== undefined) {
				return positionInteger | 0;
			}

			// Try to cast to RoomPosition
			return make(new RoomPosition(pos.x, pos.y, pos.roomName));
		}
		: function make(pos) {
			// Assume it is RoomPosition
			const rx = pos['#rx'];
			if (rx !== undefined) {
				const xx = rx * 50 + pos.x;
				const yy = pos['#ry'] * 50 + pos.y;
				return (yy << 16) | xx;
			}

			// Try to cast to RoomPosition
			return make(new RoomPosition(pos.x, pos.y, pos.roomName));
		};

const makePositionOut: (pos: number) => RoomPosition =
	// eslint-disable-next-line @typescript-eslint/prefer-ts-expect-error
	// @ts-ignore
	pf.version === 11
		? pos => RoomPosition['#create'](pos)
		: pos => {
			const wx = pos & 0xffff;
			const wy = pos >> 16;
			return RoomPosition['#create'](((wy % 50) << 24) | ((wx % 50) << 16) | ((wy / 50) << 8) | (wx / 50));
		};

export function search(origin: RoomPosition, goal: OneOrMany<Goal>, options: SearchOptions = {}) {

	const plainCost = clamp(1, 254, Number(options.plainCost) || 1) | 0;
	const swampCost = clamp(1, 254, Number(options.swampCost) || 5) | 0;
	const heuristicWeight = clamp(1, 9, Number(options.heuristicWeight) || 1.2);
	const maxOps = clamp(1, 0xffffffff, Number(options.maxOps) || 2000) >>> 0;
	const maxCost = clamp(1, 0xffffffff, Number(options.maxCost) || 0xffffffff) >>> 0;
	const maxRooms = clamp(1, 64, Number(options.maxRooms) || 16) | 0;
	const flee = Boolean(options.flee) || false;

	// Convert one-or-many goal into standard format for native extension
	const goals = (Array.isArray(goal) ? goal : [ goal ]).map((goal: any) => {
		if (goal.x !== undefined && goal.y !== undefined && goal.roomName !== undefined) {
			return {
				pos: makePositionIn(goal),
				range: 0,
			};
		} else {
			// This case detects `Goal` and `RoomObject`. The path finder was never meant to accept game
			// objects but it did by accident, so I guess here we are.
			return {
				pos: makePositionIn(goal.pos),
				range: Math.max(0, goal.range | 0),
			};
		}
	});
	if (goals.length === 0) {
		return { path: [], ops: 0, cost: 0, incomplete: false };
	}

	// Setup room callback
	const { roomCallback } = options;
	const callback = roomCallback === undefined ? undefined : (roomId: number) => {
		const ret = roomCallback(makeRoomNameFromId(roomId));
		if (ret === false) {
			return ret;
		} else if (ret) {
			return ret._bits;
		}
	};

	// Invoke native code
	const ret = pf.search(
		makePositionIn(origin), goals,
		callback,
		plainCost, swampCost,
		maxRooms, maxOps, maxCost,
		flee,
		heuristicWeight,
	);

	// Translate results
	if (ret === undefined) {
		return { path: [], ops: 0, cost: 0, incomplete: false };
	} else if (ret === -1) {
		return { path: [], ops: 0, cost: 0, incomplete: true };
	}
	return {
		...ret,
		path: ret.path.map(makePositionOut).reverse(),
	};
}

export function loadTerrain(world: World) {
	const rooms: Record<string, Readonly<Uint8Array>> = {};
	for (const [ name, terrain ] of world.entries()) {
		rooms[parseRoomNameToId(name)] = getBuffer(terrain);
	}
	pf.loadTerrain(rooms);
}

export function locateModule() {
	return pf.path;
}
