import type { ContextType, Implementation } from 'xxscreeps/utility/types';
import type { Creep } from 'xxscreeps/game/objects/creep';
import * as C from 'xxscreeps/game/constants';
import * as Id from 'xxscreeps/engine/schema/id';
import { constant, enumerated, struct, variant } from 'xxscreeps/schema';
import { registerSchema } from 'xxscreeps/engine/schema';
import { RoomObject } from 'xxscreeps/game/object';
import './creep';

// `RoomObject` intent check symbol
export const CheckHarvest = Symbol();
declare module 'xxscreeps/game/object' {
	interface RoomObject {
		[CheckHarvest](creep: Creep): C.ErrorCode;
	}
}

// Creep.harvest runtime registration hook
export interface Harvest {}
export type Harvestable = ContextType<Harvest[keyof Harvest]>;
export type HarvestResult = ReturnType<Harvest[keyof Harvest]>;

export function registerHarvestable<Type extends RoomObject, Error extends C.ErrorCode>(
	target: Implementation<Type>,
	check: (this: Type, creep: Creep) => Error,
) {
	return target.prototype[CheckHarvest] = check;
}
registerHarvestable(RoomObject, () => C.ERR_INVALID_TARGET);

// Schema registration
declare module 'xxscreeps/engine/schema' {
	interface Schema { harvestable: typeof schema }
}

const schema = [
	registerSchema('ActionLog.action', enumerated('harvest')),

	registerSchema('Room.eventLog', struct({
		...variant(C.EVENT_HARVEST),
		event: constant(C.EVENT_HARVEST),
		objectId: Id.format,
		targetId: Id.format,
		amount: 'int32',
	})),
];
