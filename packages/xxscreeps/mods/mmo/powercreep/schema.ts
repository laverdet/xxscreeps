import * as Id from 'xxscreeps/engine/schema/id.js';
import { registerEnumerated, registerVariant } from 'xxscreeps/engine/schema/index.js';
import { actionLogFormat, roomObjectShape } from 'xxscreeps/game/schema.js';
import { openStoreFormat } from 'xxscreeps/mods/classic/resource/schema.js';
import { constant, declare, enumerated, optional, struct, variant, vector } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';

// One serialized format whether the creep is sitting in the account roster or spawned into a room.
// Unspawned creeps live at `RoomPosition(0, 0, 'E0S0')` (the all-zero signed position); spawning
// copies the object into a room.
/** @internal */
export const powerCreepShape = declare('PowerCreep', struct(roomObjectShape, {
	...variant('powerCreep'),

	/**
	 * Power creep’s name. You can choose the name while creating a new power creep, and it cannot be
	 * changed later. This name is a hash key to access the creep via the
	 * [Game.powerCreeps](https://docs.screeps.com/api/#Game.powerCreeps) object.
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.name
	 */
	name: 'string',

	/**
	 * The power creep's class, one of the `POWER_CLASS` constants.
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.className
	 */
	className: enumerated(...Object.values(C.POWER_CLASS)),
	// `cooldownTime` is game-tick absolute; `0` = ready. Roster copies never carry a cooldown — it
	// is set only on the spawned room copy.
	'#powers': vector(struct({ cooldownTime: 'int32', level: 'int8', power: 'int8' })),

	/**
	 * The timestamp when spawning or deleting this creep will become available.
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.spawnCooldownTime
	 */
	// Wall-clock ms, not game ticks
	spawnCooldownTime: 'double',

	/**
	 * A timestamp when this creep is marked to be permanently deleted from the account, or `0`
	 * otherwise.
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.deleteTime
	 */
	deleteTime: 'double',

	// Room presence — empty until a spawn fills them in
	/**
	 * The current amount of hit points of the creep.
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.hits
	 */
	hits: 'int32',

	/**
	 * A [`Store`](https://docs.screeps.com/api/#Store) object that contains cargo of this creep.
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.store
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
}));

registerEnumerated('ActionLog.action', 'power');

export type PowerCreepEventRoomSchemas = [ typeof powerEventSchema ];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const powerEventSchema = registerVariant('Room.eventLog', declare('PowerEvent', struct({
	...variant(C.EVENT_POWER),
	event: constant(C.EVENT_POWER),
	objectId: Id.format,
	power: 'int8',
	targetId: optional(Id.format),
})));
