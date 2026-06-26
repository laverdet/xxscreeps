import * as Id from 'xxscreeps/engine/schema/id.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { actionLogFormat, roomObjectShape } from 'xxscreeps/game/schema.js';
import { openStoreFormat } from 'xxscreeps/mods/classic/resource/schema.js';
import { declare, enumerated, optional, struct, variant, vector } from 'xxscreeps/schema/index.js';

// A power creep is a `RoomObject` whether it is sitting in the account roster or spawned into a room,
// so it gets a single serialized format. Unspawned creeps live at `RoomPosition(0, 0, 'E0S0')` (the
// all-zero signed position); spawning is then just a matter of copying the object into a room. The
// room-presence fields (`hits`/`store`/`#ageTime`/...) carry default/empty values until a spawn fills
// them in.
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
	'#powers': vector(struct({ power: 'int8', level: 'int8' })),

	/**
	 * The timestamp when spawning or deleting this creep will become available.
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.spawnCooldownTime
	 */
	// Wall-clock ms; set when a spawned creep dies, `0` while idle.
	spawnCooldownTime: 'double',

	/**
	 * A timestamp when this creep is marked to be permanently deleted from the account, or `0`
	 * otherwise.
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.deleteTime
	 */
	deleteTime: 'double',
	// Room presence — empty/`0` while unspawned, populated by a spawn into a room. On a roster entry
	// a non-zero `#ageTime` marks the creep as currently spawned; death clears it back to `0`.
	hits: 'int32',
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
