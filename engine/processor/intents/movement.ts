import * as C from '~/game/constants';
import { Creep, Owner } from '~/game/objects/creep';
import { obstacleChecker } from '~/game/path-finder';
import { getOffsetsFromDirection, Direction, RoomPosition } from '~/game/position';
import { Objects, Room } from '~/game/room';
import { Amount } from '~/game/store';
import { accumulate, exchange, minimum } from '~/lib/utility';

// Saves list of creeps all trying to move onto the same cell
const moves = new Map<number, Creep[]>();

export function add(creep: Creep, direction: Direction) {
	// Calculate new position from direction
	const { dx, dy } = getOffsetsFromDirection(direction);
	let { x, y } = creep.pos;
	x += dx;
	y += dy;
	// Basic range check
	if (x < 0 || x >= 50 || y < 0 || y >= 50) {
		return;
	}
	// Save it to run after object intents have run
	const id = toId(x, y);
	const list = moves.get(id);
	if (list) {
		list.push(creep);
	} else {
		moves.set(id, [ creep ]);
	}
}

export function dispatch(room: Room) {
	// First resolve move conflicts
	const movingCreeps: Creep[] = [];
	for (const [ id, creeps ] of moves) {
		const { xx, yy } = fromId(id);
		const nextPosition = new RoomPosition(xx, yy, room.name);

		// In the common case whree this move isn't contested then finish early
		if (creeps.length === 1) {
			creeps[0].nextPosition = nextPosition;
			movingCreeps.push(creeps[0]);
			continue;
		}

		const objects = creeps.map(creep => {
			const move = accumulate(creep.body, part => part.type === 'move' ? 1 : 0);
			// This differs from the original Screeps movement algorithm in that it counts a creep
			// carrying 50 energy as heavier than a creep carrying 0.
			const weight = 1 + Math.max(0,
				Math.ceil(creep.carry[Amount] / C.CARRY_CAPACITY) -
				accumulate(creep.body, part => part.type === 'carry' ? 1 : 0),
			);
			return {
				creep,
				// First priority is moving creeps who are *currently* on cells where more creeps want to
				// move
				movingInto: moves.get(toId(creep.pos.x, creep.pos.y))?.length ?? 0,
				// Second priority is the move/weight ratio, faster wins
				weightRatio: move / weight,
			};
		});

		// Pick the creep to win this movement
		const first = minimum(objects, (left, right) => (
			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			right.movingInto - left.movingInto ||
			right.weightRatio - left.weightRatio
		));
		first.creep.nextPosition = nextPosition;
		movingCreeps.push(first.creep);
	}

	// Note: I think there's an issue with the safe mode algorithm part of this algorithm. If safe
	// mode is activated enemy creeps shouldn't obstruct, but they could still win a movement battle.
	// So theoretically you could surround a base with constantly moving creeps in order to obstruct.

	// After conflict resolution check for non-moving-creep obstacles
	const terrain = room.getTerrain();
	for (const creep of movingCreeps) {
		const { nextPosition } = creep;
		const check = obstacleChecker(room, creep[Owner]);
		for (const object of room[Objects]) {
			if (
				nextPosition!.isEqualTo(object) &&
				!(object as Creep).nextPosition &&
				check(object)
			) {
				delete creep.nextPosition;
			}
		}
		// Also check terrain
		if (terrain.get(nextPosition!.x, nextPosition!.y) === C.TERRAIN_MASK_WALL) {
			delete creep.nextPosition;
		}
	}

	// Clean up for next iteration
	moves.clear();
}

export function get(creep: Creep) {
	const nextPosition = exchange(creep, 'nextPosition');
	if (!nextPosition) {
		return;
	}

	// Final check for obstructing creeps
	const { room } = creep;
	for (const object of room[Objects]) {
		if (object instanceof Creep && !object.nextPosition && nextPosition.isEqualTo(object)) {
			delete creep.nextPosition;
			return undefined;
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
