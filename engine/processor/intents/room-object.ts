import type { RoomPosition } from '~/game/position';
import { generateId } from '~/engine/util/schema/id';

export function newRoomObject(pos: RoomPosition) {
	return {
		id: generateId(),
		pos,
		effects: undefined,
	};
}
