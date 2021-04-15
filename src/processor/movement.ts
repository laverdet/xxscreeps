import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import * as Game from 'xxscreeps/game';
import { LookType, NextPosition, Owner, RoomObjectWithOwner } from 'xxscreeps/game/object';
import { makeObstacleChecker } from 'xxscreeps/game/path-finder/obstacle';
import { getOffsetsFromDirection, Direction, RoomPosition } from 'xxscreeps/game/position';
import { Room } from 'xxscreeps/game/room';
import { readRoomObject } from 'xxscreeps/engine/room';
import { exchange } from 'xxscreeps/utility/utility';
import { insertObject } from 'xxscreeps/game/room/methods';
import { latin1ToBuffer } from 'xxscreeps/utility/string';
import { registerIntentProcessor } from '.';

// Add cross-room movement
declare module '.' {
	interface Intent {
		movement: typeof intents;
	}
}
const intents = registerIntentProcessor(Room, 'import', (room, context, objectPayload: string) => {
	if (Game.me !== '') {
		return;
	}
	const object = readRoomObject(latin1ToBuffer(objectPayload));
	insertObject(room, object);
	context.didUpdate();
});

// Saves list of creeps all trying to move onto the same cell
const moves = new Map<number, { mover: RoomObjectWithOwner; power: number }[]>();

export function add(mover: RoomObjectWithOwner, power: number, direction: Direction) {
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

export function dispatch(room: Room) {
	// First resolve move conflicts
	const movingObjects: RoomObjectWithOwner[] = [];
	for (const [ id, info ] of moves) {
		const { xx, yy } = fromId(id);
		const nextPosition = new RoomPosition(xx, yy, room.name);

		// In the common case whree this move isn't contested then finish early
		if (info.length === 1) {
			info[0].mover[NextPosition] = nextPosition;
			movingObjects.push(info[0].mover);
			continue;
		}

		// Build array to objects attempting to move
		const contenders = info.map(({ mover, power }) => ({
			mover,
			// First priority is moving creeps who are *currently* on cells where more creeps want to
			// move
			movingInto: moves.get(toId(mover.pos.x, mover.pos.y))?.length ?? 0,
			// Second priority is the move/weight ratio, faster wins
			power,
		}));

		// Pick the object to win this movement
		const first = Fn.minimum(contenders, (left, right) => (
			right.movingInto - left.movingInto ||
			right.power - left.power
		))!;
		first.mover[NextPosition] = nextPosition;
		movingObjects.push(first.mover);
	}

	// Note: I think there's an issue with the safe mode part of this algorithm. If safe mode is
	// activated enemy creeps shouldn't obstruct, but they could still win a movement battle. So
	// theoretically you could surround a base with constantly moving creeps in order to obstruct.

	// After conflict resolution check for non-moving-creep obstacles
	const terrain = room.getTerrain();
	check: for (const mover of movingObjects) {
		const nextPosition = mover[NextPosition]!;
		const check = makeObstacleChecker({
			room,
			type: mover[LookType],
			user: mover[Owner],
		});
		for (const look of room.lookAt(nextPosition)) {
			const obstruction = look[look.type];
			if (check(obstruction) && !obstruction[NextPosition]) {
				mover[NextPosition] = null;
				continue check;
			}
		}
		// Also check terrain
		if (terrain.get(nextPosition.x, nextPosition.y) === C.TERRAIN_MASK_WALL) {
			mover[NextPosition] = null;
		}
	}

	// Clean up for next iteration
	moves.clear();
}

export function get(object: RoomObjectWithOwner) {
	// Get next position, calculated above
	const nextPosition = exchange(object, NextPosition);
	if (!nextPosition) {
		return;
	}

	// Final check for obstructions
	const { room } = object;
	for (const look of room.lookAt(nextPosition)) {
		if (look[look.type][NextPosition] === null) {
			return;
		}
	}
	return nextPosition;
}

function fromId(id: number) {
	return { xx: id & 0xff, yy: id >>> 8 };
}

function toId(xx: number, yy: number) {
	return yy << 8 | xx;
}
