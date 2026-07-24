import * as Id from 'xxscreeps/engine/schema/id.js';
import { registerVariant, structForPath } from 'xxscreeps/engine/schema/index.js';
import { roomObjectShape } from 'xxscreeps/game/schema.js';
import { openStoreFormat } from 'xxscreeps/mods/classic/resource/schema.js';
import { constant, declare, optional, struct, variant } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';

export const structureShape =
	declare('Structure', () => struct(...structForPath<StructureSchema>()('Structure', roomObjectShape, {
		// nb: No members
	})));

export const ownedStructureShape =
	declare('OwnedStructure', () => struct(...structForPath<OwnedStructureSchema>()('OwnedStructure', structureShape, {
		'#user': Id.optionalFormat,
		// TODO: Rename to '#inactive' so default 0 value = active (true). optional('bool') takes
		// 2 bytes; should not be lazy.
		'#active': optional('bool'),
	})));

/** @internal */
export const ruinShape = declare('Ruin', struct(roomObjectShape, {
	...variant('ruin'),
	/**
	 * The time when the structure has been destroyed.
	 * @public
	 * @see https://docs.screeps.com/api/#Ruin.destroyTime
	 */
	destroyTime: 'int32',
	/**
	 * A [`Store`](https://docs.screeps.com/api/#Store) object that contains resources of this
	 * structure.
	 * @public
	 * @see https://docs.screeps.com/api/#Ruin.store
	 */
	store: openStoreFormat,
	'#decayTime': 'int32',
	'#structure': struct({
		id: Id.format,
		hitsMax: 'int32',
		type: 'string',
		user: Id.optionalFormat,
	}),
}));

export type StructureSchemaRoomSchema = typeof destroyedEventSchema;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const destroyedEventSchema = registerVariant('Room.eventLog', declare('DestroyedEvent', struct({
	...variant(C.EVENT_OBJECT_DESTROYED),
	event: constant(C.EVENT_OBJECT_DESTROYED),
	objectId: Id.format,
	type: 'string',
})));

// ---

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface StructureSchema {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface OwnedStructureSchema {}
