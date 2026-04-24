import * as Id from 'xxscreeps/engine/schema/id.js';
import { registerEnumerated, registerVariant } from 'xxscreeps/engine/schema/index.js';
import { constant, struct, variant } from 'xxscreeps/schema/index.js';
import * as C from './constants.js';
import './creep.js';

// Schema types
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const actionSchema = registerEnumerated('ActionLog.action',
	'attack', 'attacked', 'heal', 'healed',
	'rangedAttack', 'rangedHeal', 'rangedMassAttack',
);
declare module 'xxscreeps/game/object.js' {
	interface Schema { combat: typeof actionSchema }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const attackEventSchema = registerVariant('Room.eventLog', struct({
	...variant(C.EVENT_ATTACK),
	event: constant(C.EVENT_ATTACK),
	objectId: Id.format,
	targetId: Id.format,
	attackType: 'int32',
	damage: 'int32',
}));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const healEventSchema = registerVariant('Room.eventLog', struct({
	...variant(C.EVENT_HEAL),
	event: constant(C.EVENT_HEAL),
	objectId: Id.format,
	targetId: Id.format,
	healType: 'int32',
	amount: 'int32',
}));
declare module 'xxscreeps/game/room/index.js' {
	interface Schema { combat: [ typeof attackEventSchema, typeof healEventSchema ] }
}
