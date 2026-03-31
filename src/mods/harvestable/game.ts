import type { Creep } from 'xxscreeps/mods/creep/creep.js';
import type { ContextType } from 'xxscreeps/utility/types.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { registerEnumerated, registerVariant } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { RoomObject } from 'xxscreeps/game/object.js';
import { constant, struct, variant } from 'xxscreeps/schema/index.js';
import { registerHarvestable } from './index.js';
import './creep.js';

// `RoomObject` intent check symbol
declare module 'xxscreeps/game/object.js' {
	interface RoomObject {
		'#checkHarvest': (creep: Creep) => C.ErrorCode;
	}
}

// Creep.harvest runtime registration hook
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Harvest {}
export type Harvestable = ContextType<Harvest[keyof Harvest]>;
export type HarvestResult = ReturnType<Harvest[keyof Harvest]>;
registerHarvestable(RoomObject, () => C.ERR_INVALID_TARGET);

// Schema registration
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const actionSchema = registerEnumerated('ActionLog.action', 'harvest');
declare module 'xxscreeps/game/object.js' {
	interface Schema { harvestable: typeof actionSchema }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const harvestEventSchema = registerVariant('Room.eventLog', struct({
	...variant(C.EVENT_HARVEST),
	event: constant(C.EVENT_HARVEST),
	objectId: Id.format,
	targetId: Id.format,
	amount: 'int32',
}));

declare module 'xxscreeps/game/room/index.js' {
	interface Schema { harvestable: typeof harvestEventSchema }
}
