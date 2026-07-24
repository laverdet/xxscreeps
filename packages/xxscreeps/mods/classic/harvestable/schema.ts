import type { TypeOf } from 'xxscreeps/schema/index.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { registerEnumerated, registerVariant } from 'xxscreeps/engine/schema/index.js';
import { constant, declare, struct, variant } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';

registerEnumerated('ActionLog.action', 'harvest');

export type HarvestableRoomSchema = [ typeof harvestEventVariantSchema ];

export type HarvestEventType = TypeOf<typeof harvestEventSchema>;
const harvestEventSchema = declare('HarvestEvent', struct({
	...variant(C.EVENT_HARVEST),
	event: constant(C.EVENT_HARVEST),
	objectId: Id.format,
	targetId: Id.format,
	amount: 'int32',
}));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const harvestEventVariantSchema = registerVariant('Room.eventLog', harvestEventSchema);
