import * as Id from 'xxscreeps/engine/schema/id';
import { constant, enumerated, struct, variant, withType } from 'xxscreeps/schema';
import { registerSchema } from 'xxscreeps/engine/schema';

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

declare module 'xxscreeps/engine/schema' {
	interface Schema { combat: typeof schema }
}
const schema = [
	registerSchema('ActionLog.action', enumerated(
		'attack', 'attacked', 'heal', 'healed',
		'rangedAttack', 'rangedHeal', 'rangedMassAttack',
	)),

	registerSchema('Room.eventLog', struct({
		...variant(C.EVENT_ATTACK),
		event: constant(C.EVENT_ATTACK),
		objectId: Id.format,
		targetId: Id.format,
		attackType: withType<AttackTypes>('int8'),
		damage: 'int32',
	})),

	registerSchema('Room.eventLog', struct({
		...variant(C.EVENT_HEAL),
		event: constant(C.EVENT_HEAL),
		objectId: Id.format,
		targetId: Id.format,
		healType: withType<HealTypes>('int8'),
		amount: 'int32',
	})),
];
