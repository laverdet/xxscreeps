import type { Direction } from 'xxscreeps/game/position';
import type { RoomObject } from 'xxscreeps/game/object';
import * as C from 'xxscreeps/game/constants';
import { makeObstacleChecker } from 'xxscreeps/game/path-finder/obstacle';
import { RoomPosition, getOffsetsFromDirection } from 'xxscreeps/game/position';
import { Room } from 'xxscreeps/game/room';
import { readRoomObject } from 'xxscreeps/engine/db/room';
import { latin1ToBuffer } from 'xxscreeps/utility/string';
import { registerIntentProcessor } from '.';
import { getOrSet } from 'xxscreeps/utility/utility';

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
type Movement = {
	object: RoomObject;
	power: number;
	resolved: boolean;
	moved: boolean;
	xx: number;
	yy: number;
};
const movesByLocation = new Map<number, Movement[]>();
const movesByObject = new Map<RoomObject, Movement>();

export function add(object: RoomObject, power: number, direction: Direction) {
	// Calculate new position from direction
	const { dx, dy } = getOffsetsFromDirection(direction);
	let { x: xx, y: yy } = object.pos;
	xx += dx;
	yy += dy;
	// Basic range check
	if (xx < 0 || xx >= 50 || yy < 0 || yy >= 50) {
		return;
	}
	// Save it to run after object intents have run
	const id = toId(xx, yy);
	const info: Movement = {
		object,
		power,
		moved: false,
		resolved: false,
		xx,
		yy,
	};
	getOrSet(movesByLocation, id, () => []).push(info);
	movesByObject.set(object, info);
}

export function dispatch(room: Room) {
	// Recursive move resolver
	const checkersByUser = new Map<string, ReturnType<typeof makeObstacleChecker>>();
	const terrain = room.getTerrain();
	const resolve = (move: Movement, objects: RoomObject[] = []) => {
		if (move.resolved) {
			// Can't resolve twice
			return false;
		} else if (objects.length > 1) {
			if (objects[0] === move.object) {
				// Completing a circuit
				return true;
			} else if (objects.includes(move.object)) {
				// Prevent cycles
				return false;
			}
		}

		// Check terrain
		if (terrain.get(move.xx, move.yy) === C.TERRAIN_MASK_WALL) {
			move.resolved = true;
			return false;
		}

		// Check obstacles
		objects.push(move.object);
		const willMove = function() {
			const user = move.object['#user']!;
			const check = getOrSet(checkersByUser, user, () => makeObstacleChecker({ room, user }));
			const nextPosition = new RoomPosition(move.xx, move.yy, room.name);

			// Check current obstacles
			for (const object of room['#lookAt'](nextPosition)) {
				if (check(object)) {
					const move = movesByObject.get(object);
					if (move) {
						if (!move.moved && (move.resolved || !resolve(move, objects))) {
							return false;
						}
					} else {
						return false;
					}
				}
			}

			// Check moved obstacles
			for (const conflict of movesByLocation.get(toId(move.xx, move.yy)) ?? []) {
				if (conflict.moved && check(conflict.object)) {
					return false;
				}
			}
			return true;
		}();
		objects.pop();

		// Done
		if (objects.length === 0 || willMove) {
			// Unconditionally resolve this move if it's the top object.
			// Or, if an object with higher priority is pushing this one out the way then it will be
			// resolved
			move.resolved = true;
			move.moved = willMove;
		}
		return willMove;
	};

	// Resolve in order of power
	const movesByPriority = [ ...movesByObject.values() ];
	movesByPriority.sort((left, right) => (right.power - left.power) || (Math.random() - 0.5));
	movesByPriority.forEach(move => resolve(move));
}

export function get(object: RoomObject) {
	const move = movesByObject.get(object);
	return move?.moved && new RoomPosition(move.xx, move.yy, object.room.name);
}

export function flush() {
	movesByLocation.clear();
	movesByObject.clear();
}

function toId(xx: number, yy: number) {
	return yy << 8 | xx;
}
