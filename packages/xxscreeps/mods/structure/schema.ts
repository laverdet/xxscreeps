import * as Id from 'xxscreeps/engine/schema/id.js';
import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { roomObjectShape } from 'xxscreeps/game/schema.js';
import { openStoreFormat } from 'xxscreeps/mods/resource/schema.js';
import { constant, declare, optional, struct, variant } from 'xxscreeps/schema/index.js';

export const structureShape = declare('Structure', struct(roomObjectShape, {
	'#noAttackNotify': 'bool',
}));

export const ownedStructureShape = declare('OwnedStructure', struct(structureShape, {
	'#user': Id.optionalFormat,
	// TODO: Rename to '#inactive' so default 0 value = active (true). optional('bool') takes
	// 2 bytes; should not be lazy.
	'#active': optional('bool'),
}));

/** @internal */
export const ruinShape = declare('Ruin', struct(roomObjectShape, {
	...variant('ruin'),
	destroyTime: 'int32',
	store: openStoreFormat,
	'#decayTime': 'int32',
	'#structure': struct({
		id: Id.format,
		hitsMax: 'int32',
		type: 'string',
		user: Id.optionalFormat,
	}),
}));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const destroyedEventSchema = registerVariant('Room.eventLog', declare('DestroyedEvent', struct({
	...variant(C.EVENT_OBJECT_DESTROYED),
	event: constant(C.EVENT_OBJECT_DESTROYED),
	objectId: Id.format,
	type: 'string',
})));

// ---

declare module 'xxscreeps/game/room/index.js' {
	interface RoomSchema {
		structureSchema: [ typeof destroyedEventSchema ];
	}
}
