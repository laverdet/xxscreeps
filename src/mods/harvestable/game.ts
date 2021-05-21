import type { ContextType } from 'xxscreeps/utility/types';
import type { Creep } from 'xxscreeps/mods/creep/creep';
import * as C from 'xxscreeps/game/constants';
import * as Id from 'xxscreeps/engine/schema/id';
import { constant, struct, variant } from 'xxscreeps/schema';
import { registerEnumerated, registerVariant } from 'xxscreeps/engine/schema';
import { RoomObject } from 'xxscreeps/game/object';
import { registerHarvestable } from '.';
import './creep';

// `RoomObject` intent check symbol
declare module 'xxscreeps/game/object' {
	interface RoomObject {
		['#checkHarvest'](creep: Creep): C.ErrorCode;
	}
}

// Creep.harvest runtime registration hook
export interface Harvest {}
export type Harvestable = ContextType<Harvest[keyof Harvest]>;
export type HarvestResult = ReturnType<Harvest[keyof Harvest]>;
registerHarvestable(RoomObject, () => C.ERR_INVALID_TARGET);

// Schema registration
const actionSchema = registerEnumerated('ActionLog.action', 'harvest');
declare module 'xxscreeps/game/action-log' {
	interface Schema { harvestable: typeof actionSchema }
}

const harvestEventSchema = registerVariant('Room.eventLog', struct({
	...variant(C.EVENT_HARVEST),
	event: constant(C.EVENT_HARVEST),
	objectId: Id.format,
	targetId: Id.format,
	amount: 'int32',
}));

declare module 'xxscreeps/game/room' {
	interface Schema { harvestable: typeof harvestEventSchema }
}
