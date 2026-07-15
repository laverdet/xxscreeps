import { roomObjectShape } from 'xxscreeps/game/schema.js';
import { resourceEnumFormat } from 'xxscreeps/mods/classic/resource/schema.js';
import { declare, struct, variant } from 'xxscreeps/schema/index.js';

/** @internal */
export const depositShape = declare('Deposit', struct(roomObjectShape, {
	...variant('deposit'),

	/**
	 * The deposit type, one of the following constants: `RESOURCE_MIST`, `RESOURCE_BIOMASS`,
	 * `RESOURCE_METAL`, `RESOURCE_SILICON`.
	 * @public
	 * @see https://docs.screeps.com/api/#Deposit.depositType
	 */
	depositType: resourceEnumFormat,

	/**
	 * The cooldown of the last harvest operation on this deposit.
	 * @public
	 * @see https://docs.screeps.com/api/#Deposit.lastCooldown
	 */
	lastCooldown: 'int32',
	'#harvested': 'int32',
	'#cooldownTime': 'int32',
	'#nextDecayTime': 'int32',
}));
