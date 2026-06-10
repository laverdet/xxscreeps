import type { World } from 'xxscreeps/game/map.js';
import type { Goal, SearchOptions } from 'xxscreeps/game/pathfinder/index.js';
import type { PositionLike } from 'xxscreeps/game/position.js';
import type { OneOrMany } from 'xxscreeps/utility/types.js';
import * as pf from '@xxscreeps/pathfinder';
import { Fn } from 'xxscreeps/functional/fn.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { makeRoomNameFromId, parseRoomNameToId } from 'xxscreeps/game/room/name.js';
import { getBuffer } from 'xxscreeps/game/terrain.js';

function makePositionIn(pos: RoomPosition | PositionLike): number {
	// Assume it is RoomPosition
	const rx = pos['#rx'];
	if (rx !== undefined) {
		const xx = rx * 50 + pos.x;
		const yy = pos['#ry'] * 50 + pos.y;
		return (yy << 16) | xx;
	}

	// Try to cast to RoomPosition
	return makePositionIn(new RoomPosition(pos.x, pos.y, pos.roomName));
}

const makePositionOut = (xx: number, yy: number) =>
	RoomPosition['#create'](((yy % 50) << 24) | ((xx % 50) << 16) | ((yy / 50) << 8) | (xx / 50));

export const path = pf.path;

export function loadTerrain(world: World) {
	const worldTerrain = Fn.map(world.entries(), ([ name, terrain ]) => {
		const roomId = parseRoomNameToId(name);
		const buffer = getBuffer(terrain);
		return [ roomId, buffer ] as const;
	});
	pf.loadTerrain(worldTerrain);
}

export function search(origin: RoomPosition, goal: OneOrMany<Goal>, options: SearchOptions = {}) {
	// Convert one-or-many goal into standard format for native extension
	const goals = (Array.isArray(goal) ? goal : [ goal ]).map(goal => {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (goal.roomName === undefined && goal.x === undefined && goal.y === undefined) {
			// This case detects `Goal` and `RoomObject`. The path finder was never meant to accept game
			// objects but it did by accident, so I guess here we are.
			return {
				pos: makePositionIn(goal.pos),
				range: Math.max(0, goal.range | 0),
			};
		} else {
			return {
				pos: makePositionIn(goal),
				range: 0,
			};
		}
	});

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
	return pf.search(
		makePositionIn(origin), goals,
		callback,
		makePositionOut,
		options,
	);
}
