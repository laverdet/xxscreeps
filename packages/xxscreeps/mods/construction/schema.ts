import type { ConstructibleStructureType } from './construction-site.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { registerEnumerated, registerVariant } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { roomObjectShape } from 'xxscreeps/game/schema.js';
import { constant, declare, enumerated, struct, variant } from 'xxscreeps/schema/index.js';
import { structureFactories } from './symbols.js';

/** @internal */
export const constructionSiteShape = () => declare('ConstructionSite', struct(roomObjectShape, {
	...variant('constructionSite'),
	name: 'string',
	progress: 'int32',
	progressTotal: 'int32',
	structureType: enumerated(...structureFactories.keys() as never as ConstructibleStructureType[]),
	'#user': Id.format,
}));

// Schema types
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const actionSchema = registerEnumerated('ActionLog.action', 'build', 'repair');

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const buildEventSchema = registerVariant('Room.eventLog', declare('BuildEvent', struct({
	...variant(C.EVENT_BUILD),
	event: constant(C.EVENT_BUILD),
	objectId: Id.format,
	targetId: Id.format,
	amount: 'int32',
	energySpent: 'int32',
	structureType: 'string',
	x: 'int8',
	y: 'int8',
	incomplete: 'bool',
})));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const repairEventSchema = registerVariant('Room.eventLog', declare('RepairEvent', struct({
	...variant(C.EVENT_REPAIR),
	event: constant(C.EVENT_REPAIR),
	objectId: Id.format,
	targetId: Id.format,
	amount: 'int32',
	energySpent: 'int32',
})));

// ---

declare module 'xxscreeps/game/schema.js' {
	interface ActionLogSchema { construction: typeof actionSchema }
}

declare module 'xxscreeps/game/room/index.js' {
	interface RoomSchema {
		constructionSchema: [
			typeof buildEventSchema,
			typeof repairEventSchema,
		];
	}
}
