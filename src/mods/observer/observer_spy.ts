import * as Id from 'xxscreeps/engine/schema/id';
import { RoomObject, create as objectCreate, format as objectFormat } from 'xxscreeps/game/object';

import type { RoomPosition } from 'xxscreeps/game/position';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/utility/utility';

export const format = () => compose(shape, ObserverSpy);
const shape = declare('ObserverSpy', struct(objectFormat, {
	...variant('ObserverSpy'),
	'#user': Id.format,
}));

export class ObserverSpy extends withOverlay(RoomObject, shape) {
	get '#lookType'(): string | null { return null }
	override get ['#providesVision']() { return true }
	override get ['#hasIntent']() { return true }
}

export function create(pos: RoomPosition, owner: string) {
	return assign(objectCreate(new ObserverSpy, pos), {
		'#user': owner,
	});
}
