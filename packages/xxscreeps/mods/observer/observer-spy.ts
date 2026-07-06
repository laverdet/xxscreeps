import type { RoomPosition } from 'xxscreeps/game/position.js';
import { RoomObject, createRoomObject } from 'xxscreeps/game/object.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { observerSpyShape } from './schema.js';

export class ObserverSpy extends withOverlay(RoomObject, observerSpyShape) {
	get '#lookType'() { return null; }
	override get '#providesVision'() { return true; }
}

export function create(pos: RoomPosition, owner: string) {
	const object = createRoomObject(new ObserverSpy(), pos);
	object['#user'] = owner;
	return object;
}
