import { chainIntentChecks, checkRange, checkTarget } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { registerHarvestable } from 'xxscreeps/mods/classic/harvestable/game.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { depositShape } from './schema.js';

/**
 * A rare resource deposit needed for producing commodities. Can be harvested by creeps with a
 * `WORK` body part. Each harvest operation triggers a cooldown period, which becomes longer and
 * longer over time. Learn more about deposits from [this
 * article](https://docs.screeps.com/resources.html).
 * @public
 * @see https://docs.screeps.com/api/#Deposit
 */
export class Deposit extends withOverlay(RoomObject.RoomObject, depositShape) {
	/**
	 * The amount of game ticks until the next harvest action is possible.
	 * @public
	 * @see https://docs.screeps.com/api/#Deposit.cooldown
	 */
	@enumerable get cooldown() { return RoomObject.cooldownTime(this['#cooldownTime']); }

	/**
	 * The amount of game ticks when this deposit will disappear.
	 * @public
	 * @see https://docs.screeps.com/api/#Deposit.ticksToDecay
	 */
	@enumerable get ticksToDecay() { return RoomObject.requiredExpiryTime(this['#nextDecayTime']); }

	get '#lookType'() { return C.LOOK_DEPOSITS; }
}

registerGlobal(Deposit);
declare module 'xxscreeps/game/runtime.js' {
	interface Global { Deposit: typeof Deposit }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const harvest = registerHarvestable(Deposit, function(creep) {
	return chainIntentChecks(
		() => checkTarget(this, Deposit),
		() => checkRange(creep, this, 1),
		() => this.cooldown === 0 ? undefined : C.ERR_TIRED);
});
declare module 'xxscreeps/mods/classic/harvestable/game.js' {
	interface Harvest { deposit: typeof harvest }
}
