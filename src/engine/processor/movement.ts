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
	dispatch?: DispatchCallback;
	initial: InitialCallback;
	object: RoomObject;
	power: number | undefined;
	resolved: boolean;
	moved: boolean;
	id: number;
	pos: RoomPosition;
};
type InitialCallback = (
	commit: (power: number, dispatch: DispatchCallback) => boolean,
	look: LookCallback,
) => boolean | undefined;
type DispatchCallback = (pos: RoomPosition) => void;
type LookCallback = (object: RoomObject) => RoomPosition | undefined;

const movesByLocation = new Map<number, Movement[]>();
const movesByObject = new Map<RoomObject, Movement>();

export function announce(object: RoomObject, direction: Direction, next: InitialCallback) {
	// Calculate new position from direction
	const { dx, dy } = getOffsetsFromDirection(direction);
	let { x: xx, y: yy } = object.pos;
	xx += dx;
	yy += dy;
	// Basic range check
	if (xx < 0 || xx >= 50 || yy < 0 || yy >= 50) {
		return;
	}
	// Save initial movement data
	const id = yy << 8 | xx;
	const move: Movement = {
		dispatch: undefined,
		initial: next,
		object,
		power: undefined,
		moved: false,
		resolved: false,
		id,
		pos: new RoomPosition(xx, yy, object.room.name),
	};
	getOrSet(movesByLocation, id, () => []).push(move);
	movesByObject.set(object, move);
}

export function dispatch(room: Room) {
	// Invoke register movement callbacks
	const look = (object: RoomObject) => movesByObject.get(object)?.pos;
	for (const move of movesByObject.values()) {
		const { object } = move;
		const willRemove = function() {
			// Make sure this object is still active
			if (!object.room as unknown) {
				return true;
			}
			// Invoke second movement pass
			return !move.initial((power, dispatch) => {
				move.power = power;
				move.dispatch = dispatch;
				return true;
			}, look);
		}();
		// Remove if no longer moveable
		if (willRemove) {
			movesByLocation.delete(move.id);
			movesByObject.delete(object);
		}
	}
	if (movesByObject.size === 0) {
		return;
	}

	// Recursive move resolver
	const checkersByUser = new Map<string, ReturnType<typeof makeObstacleChecker>>();
	const terrain = room.getTerrain();
	const resolve = (move: Movement, stack: RoomObject[] = []) => {
		if (move.resolved) {
			// Can't resolve twice
			return false;
		} else if (stack[0] === move.object) {
			// Completing a circuit
			return true;
		} else if (stack.includes(move.object)) {
			// Prevent cycles
			return false;
		}

		// Check terrain
		const nextPosition = move.pos;
		if (terrain.get(nextPosition.x, nextPosition.y) === C.TERRAIN_MASK_WALL) {
			move.resolved = true;
			return false;
		}

		// Check obstacles
		stack.push(move.object);
		const willMove = function() {
			const user = move.object['#user']!;
			const check = getOrSet(checkersByUser, user, () => makeObstacleChecker({ room, user }));

			// Check current obstacles
			for (const object of room['#lookAt'](nextPosition)) {
				if (check(object)) {
					const move = movesByObject.get(object);
					if (!move || (!move.moved && (move.resolved || !resolve(move, stack)))) {
						return false;
					}
				}
			}

			// Check moved obstacles
			for (const conflict of movesByLocation.get(move.id) ?? []) {
				if (conflict.moved && check(conflict.object)) {
					return false;
				}
			}
			return true;
		}();
		stack.pop();

		// Done
		if (stack.length === 0 || willMove) {
			// Unconditionally resolve this move if it's the top object.
			// Or, if an object with higher priority is pushing this one out the way then it will be
			// resolved
			move.resolved = true;
			move.moved = willMove;
		}
		if (willMove) {
			move.dispatch!(nextPosition);
		}
		return willMove;
	};

	// Resolve in order of power
	const movesByPriority = [ ...movesByObject.values() ];
	movesByPriority.sort((left, right) => (right.power! - left.power!) || (Math.random() - 0.5));
	movesByPriority.forEach(move => resolve(move));
	movesByLocation.clear();
	movesByObject.clear();
}
