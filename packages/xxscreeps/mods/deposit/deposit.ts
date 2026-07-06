import { chainIntentChecks, checkRange, checkTarget } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { registerHarvestable } from 'xxscreeps/mods/harvestable/game.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { depositShape } from './schema.js';

export class Deposit extends withOverlay(RoomObject.RoomObject, depositShape) {
	@enumerable get cooldown() { return RoomObject.cooldownTime(this['#cooldownTime']); }
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
declare module 'xxscreeps/mods/harvestable/game.js' {
	interface Harvest { deposit: typeof harvest }
}
