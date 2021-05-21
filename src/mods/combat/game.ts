import * as Id from 'xxscreeps/engine/schema/id';
import { constant, struct, variant, withType } from 'xxscreeps/schema';
import { registerEnumerated, registerVariant } from 'xxscreeps/engine/schema';

import * as C from './constants';
import './creep';

// Schema types
export type AttackTypes =
	typeof C.EVENT_ATTACK_TYPE_MELEE |
	typeof C.EVENT_ATTACK_TYPE_RANGED |
	typeof C.EVENT_ATTACK_TYPE_RANGED_MASS |
	typeof C.EVENT_ATTACK_TYPE_HIT_BACK;
export type HealTypes =
	typeof C.EVENT_HEAL_TYPE_MELEE |
	typeof C.EVENT_HEAL_TYPE_RANGED;

const actionSchema = registerEnumerated('ActionLog.action',
	'attack', 'attacked', 'heal', 'healed',
	'rangedAttack', 'rangedHeal', 'rangedMassAttack',
);
declare module 'xxscreeps/game/action-log' {
	interface Schema { combat: typeof actionSchema }
}

const attackEventSchema = registerVariant('Room.eventLog', struct({
	...variant(C.EVENT_ATTACK),
	event: constant(C.EVENT_ATTACK),
	objectId: Id.format,
	targetId: Id.format,
	attackType: withType<AttackTypes>('int8'),
	damage: 'int32',
}));
const healEventSchema = registerVariant('Room.eventLog', struct({
	...variant(C.EVENT_HEAL),
	event: constant(C.EVENT_HEAL),
	objectId: Id.format,
	targetId: Id.format,
	healType: withType<HealTypes>('int8'),
	amount: 'int32',
}));
declare module 'xxscreeps/game/room' {
	interface Schema { combat: [ typeof attackEventSchema, typeof healEventSchema ] }
}
