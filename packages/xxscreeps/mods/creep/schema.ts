import * as Id from 'xxscreeps/engine/schema/id.js';
import { registerVariant, structForPath } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { actionLogFormat, roomObjectShape } from 'xxscreeps/game/schema.js';
import { openStoreFormat, optionalResourceEnumFormat, resourceEnumFormat } from 'xxscreeps/mods/resource/schema.js';
import { constant, declare, enumerated, optional, struct, variant, vector } from 'xxscreeps/schema/index.js';

// Creep schema (moddable)
export const creepShape = declare('Creep', () => struct(...structForPath<CreepSchema>()('Creep', roomObjectShape, {
	...variant('creep'),
	body: vector(struct({
		boost: optionalResourceEnumFormat,
		hits: 'int8',
		type: enumerated(...C.BODYPARTS_ALL),
	})),
	fatigue: 'int32',
	hits: 'int32',
	name: 'string',
	store: openStoreFormat,
	'#actionLog': actionLogFormat,
	'#ageTime': 'int32',
	'#saying': optional(struct({
		isPublic: 'bool',
		message: 'string',
		time: 'int32',
	})),
	'#user': Id.format,
})));

/** @internal */
export const tombstoneShape = declare('Tombstone', struct(roomObjectShape, {
	...variant('tombstone'),
	deathTime: 'int32',
	store: openStoreFormat,
	'#creep': struct({
		body: vector(enumerated(...C.BODYPARTS_ALL)),
		id: Id.format,
		name: 'string',
		saying: optional('string'),
		ticksToLive: 'int32',
		user: Id.format,
	}),
	'#decayTime': 'int32',
}));

// Schema types
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const transferEventSchema = registerVariant('Room.eventLog', declare('TransferEvent', struct({
	...variant(C.EVENT_TRANSFER),
	event: constant(C.EVENT_TRANSFER),
	objectId: Id.format,
	targetId: Id.format,
	resourceType: resourceEnumFormat,
	amount: 'int32',
})));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const exitEventSchema = registerVariant('Room.eventLog', declare('ExitEvent', struct({
	...variant(C.EVENT_EXIT),
	event: constant(C.EVENT_EXIT),
	objectId: Id.format,
	room: 'string',
	x: 'int8',
	y: 'int8',
})));

// ---

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CreepSchema {}

declare module 'xxscreeps/game/room/index.js' {
	interface RoomSchema {
		creepSchema: [
			typeof transferEventSchema,
			typeof exitEventSchema,
		];
	}
}
