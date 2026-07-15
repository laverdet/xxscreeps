import { RoomObject, optionalExpiryTime } from 'xxscreeps/game/object.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import * as C from './constants.js';
import { sourceShape } from './schema.js';

// Game object declaration
/**
 * An energy source object. Can be harvested by creeps with a `WORK` body part.
 * @public
 * @see https://docs.screeps.com/api/#Source
 */
export class Source extends withOverlay(RoomObject, sourceShape) {

	/**
	 * The remaining time after which the source will be refilled.
	 * @public
	 * @see https://docs.screeps.com/api/#Source.ticksToRegeneration
	 */
	@enumerable get ticksToRegeneration() { return optionalExpiryTime(this['#nextRegenerationTime']); }

	get '#lookType'() { return C.LOOK_SOURCES; }

	override '#roomStatusDidChange'(level: number, userId: string | undefined | null) {
		this.energyCapacity = function() {
			if (userId === undefined) {
				return C.SOURCE_ENERGY_KEEPER_CAPACITY;
			} else if (userId === null) {
				return C.SOURCE_ENERGY_NEUTRAL_CAPACITY;
			} else {
				return C.SOURCE_ENERGY_CAPACITY;
			}
		}();
		this.energy = Math.min(this.energy, this.energyCapacity);
	}
}
