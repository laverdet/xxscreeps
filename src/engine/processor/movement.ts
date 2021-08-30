import type { Direction } from 'xxscreeps/game/position';
import type { RoomObject } from 'xxscreeps/game/object';
import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import { Game } from 'xxscreeps/game';
import { makeObstacleChecker } from 'xxscreeps/game/path-finder/obstacle';
import { RoomPosition, getOffsetsFromDirection } from 'xxscreeps/game/position';
import { Room } from 'xxscreeps/game/room';
import { readRoomObject } from 'xxscreeps/engine/db/room';
import { latin1ToBuffer } from 'xxscreeps/utility/string';
import { registerIntentProcessor } from '.';

// Add cross-room movement
declare module '.' {
	interface Intent {
		movement: typeof intents;
	}
}
const intents = registerIntentProcessor(Room, 'import', { internal: true }, (room, context, objectPayload: string) => {
	const object = readRoomObject(latin1ToBuffer(objectPayload));
	room['#insertObject'](object);
	context.didUpdate();
});

// Saves list of creeps all trying to move onto the same cell
const moves = new Map<number, { mover: RoomObject; power: number }[]>();

export function add(mover: RoomObject, power: number, direction: Direction) {
	// Calculate new position from direction
	const { dx, dy } = getOffsetsFromDirection(direction);
	let { x, y } = mover.pos;
	x += dx;
	y += dy;
	// Basic range check
	if (x < 0 || x >= 50 || y < 0 || y >= 50) {
		return;
	}
	// Save it to run after object intents have run
	const id = toId(x, y);
	const list = moves.get(id);
	const info = { mover, power };
	if (list) {
		list.push(info);
	} else {
		moves.set(id, [ info ]);
	}
}

function remove(removedMover: RoomObject) {
	removedMover.nextPositionTime = -1;
	const blockedMovers = moves.get(toId(removedMover.pos.x, removedMover.pos.y));
	for (const { mover } of blockedMovers ?? []) {
		if (mover.nextPositionTime === Game.time) {
			const check = makeObstacleChecker({
				room: mover.room,
				user: mover['#user']!,
			});
			if (check(removedMover)) {
				remove(mover);
			}
		}
	}
}

export function dispatch(room: Room) {
	// First resolve move conflicts
	const { time } = Game;
	const movingObjects: RoomObject[] = [];
	for (const [ id, info ] of moves) {
		const { xx, yy } = fromId(id);
		const nextPosition = new RoomPosition(xx, yy, room.name);

		// In the common case where this move isn't contested then finish early
		if (info.length === 1) {
			const { mover } = info[0];
			if (mover.room as any) {
				mover.nextPosition = nextPosition;
				mover.nextPositionTime = Game.time;
				movingObjects.push(mover);
			}
			continue;
		}

		// Build list of objects attempting to move
		const contenders = Fn.map(Fn.filter(info, move => move.mover.room), ({ mover, power }) => ({
			mover,
			// First priority is the move/weight ratio, higher wins
			power,
			// Second priority is moving creeps who are *currently* on cells where more creeps want to
			// move
			movingInto: function() {
				const followers = moves.get(toId(mover.pos.x, mover.pos.y));
				if (followers) {
					if (followers.some(({ mover }) => mover.pos.isEqualTo(xx, yy))) {
						// This strange special case non-recursively checks if another move is dependent on this
						// one, and applies the maximum priority if so.
						return 9;
					} else {
						return followers.length;
					}
				} else {
					return 0;
				}
			}(),
		}));

		// Pick the object to win this movement
		// TODO: New movement algorithm should enforce power first
		const move = Fn.minimum(contenders, (left, right) =>
			right.movingInto - left.movingInto ||
			right.power - left.power,
		);
		if (move) {
			move.mover.nextPosition = nextPosition;
			move.mover.nextPositionTime = time;
			movingObjects.push(move.mover);
		}
	}

	// Note: I think there's an issue with the safe mode part of this algorithm. If safe mode is
	// activated enemy creeps shouldn't obstruct, but they could still win a movement battle. So
	// theoretically you could surround a base with constantly moving creeps in order to obstruct.

	// After conflict resolution check for non-moving-creep obstacles
	const terrain = room.getTerrain();
	check: for (const mover of movingObjects) {
		if (mover.nextPositionTime === time) {
			const nextPosition = mover.nextPosition!;
			const check = makeObstacleChecker({
				room,
				user: mover['#user']!,
			});
			for (const object of room['#lookAt'](nextPosition)) {
				if (check(object) && object.nextPositionTime !== time) {
					remove(mover);
					continue check;
				}
			}
			// Also check terrain
			if (terrain.get(nextPosition.x, nextPosition.y) === C.TERRAIN_MASK_WALL) {
				remove(mover);
			}
		}
	}

	// Clean up for next iteration
	moves.clear();
}

export function get(mover: RoomObject) {
	// Get next position, calculated above
	if (mover.nextPositionTime === Game.time) {
		return mover.nextPosition;
	}
}

function fromId(id: number) {
	return { xx: id & 0xff, yy: id >>> 8 };
}

function toId(xx: number, yy: number) {
	return yy << 8 | xx;
}
