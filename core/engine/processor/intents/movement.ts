import * as C from 'xxscreeps/game/constants';
import { Creep } from 'xxscreeps/game/objects/creep';
import { obstacleChecker } from 'xxscreeps/game/path-finder';
import { getOffsetsFromDirection, Direction, RoomPosition } from 'xxscreeps/game/position';
import { Room } from 'xxscreeps/game/room';
import { accumulate, exchange, minimum, concatInPlace } from 'xxscreeps/utility/utility';
import { calculatePower } from './creep';

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
			creeps[0]._nextPosition = nextPosition;
			movingCreeps.push(creeps[0]);
			continue;
		}

		const objects = creeps.map(creep => {
			const move = calculatePower(creep, C.MOVE, 2);
			// This differs from the original Screeps movement algorithm in that it counts a creep
			// carrying 50 energy as heavier than a creep carrying 0.
			const weight = 1 + calculateWeight(creep);
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
		first.creep._nextPosition = nextPosition;
		movingCreeps.push(first.creep);
	}

	// Note: I think there's an issue with the safe mode part of this algorithm. If safe mode is
	// activated enemy creeps shouldn't obstruct, but they could still win a movement battle. So
	// theoretically you could surround a base with constantly moving creeps in order to obstruct.

	// After conflict resolution check for non-moving-creep obstacles
	const terrain = room.getTerrain();
	check: for (const creep of movingCreeps) {
		const { _nextPosition } = creep;
		const check = obstacleChecker(room, creep.owner);
		for (const look of concatInPlace(
			room.lookForAt(C.LOOK_CREEPS, _nextPosition!),
			room.lookForAt(C.LOOK_STRUCTURES, _nextPosition!),
		)) {
			const object = look[look.type];
			if (
				!(object as Creep)._nextPosition &&
				check(object)
			) {
				delete creep._nextPosition;
				continue check;
			}
		}
		// Also check terrain
		if (terrain.get(_nextPosition!.x, _nextPosition!.y) === C.TERRAIN_MASK_WALL) {
			delete creep._nextPosition;
		}
	}

	// Clean up for next iteration
	moves.clear();
}

export function get(creep: Creep) {
	const nextPosition = exchange(creep, '_nextPosition');
	if (!nextPosition) {
		return;
	}

	// Final check for obstructing creeps
	const { room } = creep;
	for (const look of room.lookForAt(C.LOOK_CREEPS, nextPosition)) {
		if (!look.creep._nextPosition) {
			return undefined;
		}
	}
	return nextPosition;
}

export function calculateWeight(creep: Creep) {
	let weight = accumulate(creep.body, part =>
		(part.type === C.CARRY || part.type === C.MOVE) ? 0 : 1);
	weight += Math.ceil(creep.carry.getUsedCapacity() / C.CARRY_CAPACITY);
	return weight;
}

function fromId(id: number) {
	return { xx: id & 0xff, yy: id >>> 8 };
}

function toId(xx: number, yy: number) {
	return yy << 8 | xx;
}
