import * as Id from 'xxscreeps/engine/schema/id.js';
import { registerVariant, structForPath } from 'xxscreeps/engine/schema/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { actionLogFormat, roomObjectShape } from 'xxscreeps/game/schema.js';
import { openStoreFormat, optionalResourceEnumFormat, resourceEnumFormat } from 'xxscreeps/mods/classic/resource/schema.js';
import { constant, declare, enumerated, optional, struct, variant, vector } from 'xxscreeps/schema/index.js';

// Creep schema (moddable)
export const creepShape = declare('Creep', () => struct(...structForPath<CreepSchema>()('Creep', roomObjectShape, {
	...variant('creep'),
	/**
	 * An array describing the creep's body. Each element contains the following properties: `type` —
	 * one of the body part types constants; `hits` — the remaining amount of hit points of this body
	 * part; `boost` — if the body part is boosted, this property specifies the mineral type which is
	 * used for boosting. One of the `RESOURCE_*` constants.
	 * [Learn more](https://docs.screeps.com/resources.html)
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.body
	 */
	body: vector(struct({
		boost: optionalResourceEnumFormat,
		hits: 'int8',
		type: enumerated(...C.BODYPARTS_ALL),
	})),
	/**
	 * The movement fatigue indicator. If it is greater than zero, the creep cannot move.
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.fatigue
	 */
	fatigue: 'int32',
	/**
	 * The current amount of hit points of the creep.
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.hits
	 */
	hits: 'int32',
	/**
	 * Creep's name. You can choose the name while creating a new creep, and it cannot be changed
	 * later. This name is a hash key to access the creep via the
	 * [Game.creeps](https://docs.screeps.com/api/#Game.creeps) object.
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.name
	 */
	name: 'string',
	/**
	 * A [`Store`](https://docs.screeps.com/api/#Store) object that contains cargo of this creep.
	 * @public
	 * @see https://docs.screeps.com/api/#Creep.store
	 */
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
	/**
	 * Time of death.
	 * @public
	 * @see https://docs.screeps.com/api/#Tombstone.deathTime
	 */
	deathTime: 'int32',
	/**
	 * A [`Store`](https://docs.screeps.com/api/#Store) object that contains cargo of this structure.
	 * @public
	 * @see https://docs.screeps.com/api/#Tombstone.store
	 */
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
