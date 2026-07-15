import * as Id from 'xxscreeps/engine/schema/id.js';
import { registerEnumerated, registerStruct, registerVariant } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { ownedStructureShape } from 'xxscreeps/mods/classic/structure/schema.js';
import { constant, declare, optional, struct, variant } from 'xxscreeps/schema/index.js';

/** @internal */
export const controllerShape = declare('Controller', struct(ownedStructureShape, {
	...variant('controller'),

	/**
	 * Whether using power is enabled in this room. Use
	 * [`PowerCreep.enableRoom`](https://docs.screeps.com/api/#PowerCreep.enableRoom) to turn powers
	 * on.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureController.isPowerEnabled
	 */
	isPowerEnabled: 'bool',

	/**
	 * Safe mode activations available to use.
	 * @public
	 * @see https://docs.screeps.com/api/#StructureController.safeModeAvailable
	 */
	safeModeAvailable: 'int32',
	'#downgradeTime': 'int32',
	'#progress': 'int32',
	'#reservationEndTime': 'int32',
	'#safeModeCooldownTime': 'int32',
	'#upgradeBlockedUntil': 'int32',
	'#upgradeInvulnerableUntil': 'int32',
}));

/** @internal */
export const roomSchema = registerStruct('Room', {
	'#level': 'int32',
	'#safeModeUntil': 'int32',
	'#sign': optional(struct({
		datetime: 'double',
		text: 'string',
		time: 'int32',
		userId: Id.format,
	})),
	// string = controlled/reserved; null = unowned; undefined = no controller
	'#user': optional(Id.optionalFormat),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const actionSchema = registerEnumerated('ActionLog.action', 'reserveController', 'upgradeController');

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const attackControllerEventSchema = registerVariant('Room.eventLog', declare('AttackControllerEvent', struct({
	...variant(C.EVENT_ATTACK_CONTROLLER),
	event: constant(C.EVENT_ATTACK_CONTROLLER),
	objectId: Id.format,
})));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const reserveControllerEventSchema = registerVariant('Room.eventLog', declare('ReserveControllerEvent', struct({
	...variant(C.EVENT_RESERVE_CONTROLLER),
	event: constant(C.EVENT_RESERVE_CONTROLLER),
	objectId: Id.format,
	amount: 'int32',
})));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const upgradeControllerEventSchema = registerVariant('Room.eventLog', declare('UpgradeControllerEvent', struct({
	...variant(C.EVENT_UPGRADE_CONTROLLER),
	event: constant(C.EVENT_UPGRADE_CONTROLLER),
	objectId: Id.format,
	amount: 'int32',
	energySpent: 'int32',
})));

// ---

declare module 'xxscreeps/game/room/index.js' {
	interface RoomSchema {
		controllerSchema: [
			typeof attackControllerEventSchema,
			typeof reserveControllerEventSchema,
			typeof upgradeControllerEventSchema,
		];
	}
}

declare module 'xxscreeps/game/object.js' {
	interface RoomObject {
		// eslint-disable-next-line @typescript-eslint/method-signature-style
		'#roomStatusDidChange'(level: number, userId: string | null | undefined): void;
	}
}

declare module 'xxscreeps/game/schema.js' {
	interface ActionLogSchema { controller: typeof actionSchema }
}
