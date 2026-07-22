import * as Id from 'xxscreeps/engine/schema/id.js';
import { registerEnumerated, registerVariant } from 'xxscreeps/engine/schema/index.js';
import { constant, declare, struct, variant } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const actionSchema = registerEnumerated('ActionLog.action', 'harvest');

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const harvestEventSchema = registerVariant('Room.eventLog', declare('HarvestEvent', struct({
	...variant(C.EVENT_HARVEST),
	event: constant(C.EVENT_HARVEST),
	objectId: Id.format,
	targetId: Id.format,
	amount: 'int32',
})));

// ---

declare module 'xxscreeps/game/schema.js' {
	interface ActionLogSchema { harvestable: typeof actionSchema }
}

declare module 'xxscreeps:mods/game' {
	interface RoomSchema { harvestable: typeof harvestEventSchema }
}
