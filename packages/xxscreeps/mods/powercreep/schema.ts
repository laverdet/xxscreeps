import * as C from 'xxscreeps/game/constants/index.js';
import { roomObjectShape } from 'xxscreeps/game/schema.js';
import { declare, enumerated, struct, vector } from 'xxscreeps/schema/index.js';

/** @internal */
export const powerCreepShape = declare('PowerCreep', struct(roomObjectShape, {
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
	spawnCooldownTime: 'double',

	/**
	 * A timestamp when this creep is marked to be permanently deleted from the account, or `0`
	 * otherwise.
	 * @public
	 * @see https://docs.screeps.com/api/#PowerCreep.deleteTime
	 */
	deleteTime: 'double',
}));
