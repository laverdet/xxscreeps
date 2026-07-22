import type { ConstructibleStructureType } from './construction-site.js';
import * as Id from 'xxscreeps/engine/schema/id.js';
import { registerEnumerated, registerVariant } from 'xxscreeps/engine/schema/index.js';
import { roomObjectShape } from 'xxscreeps/game/schema.js';
import { constant, declare, enumerated, struct, variant } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';
import { structureFactories } from './symbols.js';

/** @internal */
export const constructionSiteShape = () => declare('ConstructionSite', struct(roomObjectShape, {
	...variant('constructionSite'),
	/**
	 * The name of the structure, for structures that support it (currently only spawns).
	 * @public
	 */
	name: 'string',
	/**
	 * The current construction progress.
	 * @public
	 * @see https://docs.screeps.com/api/#ConstructionSite.progress
	 */
	progress: 'int32',
	/**
	 * The total construction progress needed for the structure to be built.
	 * @public
	 * @see https://docs.screeps.com/api/#ConstructionSite.progressTotal
	 */
	progressTotal: 'int32',
	/**
	 * One of the `STRUCTURE_*` constants.
	 * @public
	 * @see https://docs.screeps.com/api/#ConstructionSite.structureType
	 */
	structureType: enumerated(...structureFactories.keys() as never as ConstructibleStructureType[]),
	'#user': Id.format,
}));

// Schema types
registerEnumerated('ActionLog.action', 'build', 'repair');

export type ConstructionEventRoomSchemas = [ typeof buildEventSchema, typeof repairEventSchema ];

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
