import type { RoomPosition } from 'xxscreeps/game/position';
import * as Id from 'xxscreeps/engine/schema/id';
import { RoomObject, create as objectCreate, format as objectFormat } from 'xxscreeps/game/object';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';

export const format = () => compose(shape, ObserverSpy);
const shape = declare('ObserverSpy', struct(objectFormat, {
	...variant('ObserverSpy'),
	'#user': Id.format,
}));

export class ObserverSpy extends withOverlay(RoomObject, shape) {
	get '#lookType'() { return null }
	override get ['#providesVision']() { return true }
}

export function create(pos: RoomPosition, owner: string) {
	const object = objectCreate(new ObserverSpy, pos);
	object['#user'] = owner;
	return object;
}
