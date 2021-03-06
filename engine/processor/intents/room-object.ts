import type { RoomPosition } from 'xxscreeps/game/position';
import { generateId } from 'xxscreeps/engine/schema/id';

export function newRoomObject(pos: RoomPosition) {
	return {
		id: generateId(),
		pos,
		effects: undefined,
	};
}
