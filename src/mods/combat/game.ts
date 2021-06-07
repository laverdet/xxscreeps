import * as C from './constants';
import * as Id from 'xxscreeps/engine/schema/id';
import { constant, struct, variant } from 'xxscreeps/schema';
import { registerEnumerated, registerVariant } from 'xxscreeps/engine/schema';
import './creep';

// Schema types
const actionSchema = registerEnumerated('ActionLog.action',
	'attack', 'attacked', 'heal', 'healed',
	'rangedAttack', 'rangedHeal', 'rangedMassAttack',
);
declare module 'xxscreeps/game/object' {
	interface Schema { combat: typeof actionSchema }
}

const attackEventSchema = registerVariant('Room.eventLog', struct({
	...variant(C.EVENT_ATTACK),
	event: constant(C.EVENT_ATTACK),
	objectId: Id.format,
	targetId: Id.format,
	attackType: 'int32',
	damage: 'int32',
}));
const healEventSchema = registerVariant('Room.eventLog', struct({
	...variant(C.EVENT_HEAL),
	event: constant(C.EVENT_HEAL),
	objectId: Id.format,
	targetId: Id.format,
	healType: 'int32',
	amount: 'int32',
}));
declare module 'xxscreeps/game/room' {
	interface Schema { combat: [ typeof attackEventSchema, typeof healEventSchema ] }
}
