import { registerGlobal } from 'xxscreeps/game/index.js';
import { RoomObject, optionalExpiryTime } from 'xxscreeps/game/object.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';
import { mineralShape } from './schema.js';

// Game object declaration
/**
 * A mineral deposit. Can be harvested by creeps with a `WORK` body part using the extractor
 * structure. Learn more about minerals from
 * [this article](https://docs.screeps.com/resources.html).
 * @public
 * @see https://docs.screeps.com/api/#Mineral
 */
export class Mineral extends withOverlay(RoomObject, mineralShape) {
	/**
	 * The remaining time after which the deposit will be refilled.
	 * @public
	 * @see https://docs.screeps.com/api/#Mineral.ticksToRegeneration
	 */
	@enumerable get ticksToRegeneration() { return optionalExpiryTime(this['#nextRegenerationTime']); }

	get '#lookType'() { return C.LOOK_MINERALS; }
}

// Export `Mineral` to runtime globals
registerGlobal(Mineral);
