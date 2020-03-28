import type { RoomPosition } from '~/game/position';
import { generateId } from '~/engine/util/id';

export function newRoomObject(pos: RoomPosition) {
	return {
		id: generateId(),
		pos,
		effects: undefined,
	};
}
