import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game';
import * as RoomObject from 'xxscreeps/game/object';
import { compose, declare, struct, variant, withOverlay, XSymbol } from 'xxscreeps/schema';
import { registerHarvestable } from 'xxscreeps/mods/harvestable';
import { resourceEnumFormat } from 'xxscreeps/mods/resource/resource';
import { lookForStructureAt } from 'xxscreeps/mods/structure/structure';
import { chainIntentChecks, checkRange, checkTarget } from 'xxscreeps/game/checks';
import { checkCommon } from 'xxscreeps/mods/creep/creep';

export const NextRegenerationTime = XSymbol('nextRegenerationTime');

export const format = () => compose(shape, Mineral);
const shape = declare('Mineral', struct(RoomObject.format, {
	...variant('mineral'),
	density: 'int32',
	mineralAmount: 'int32',
	mineralType: resourceEnumFormat,
	[NextRegenerationTime]: 'int32',
}));

// Game object declaration
export class Mineral extends withOverlay(RoomObject.RoomObject, shape) {
	get ticksToRegeneration() {
		return this[NextRegenerationTime] === 0 ? undefined : Math.max(0, this[NextRegenerationTime] - Game.time);
	}
	get [RoomObject.LookType]() { return C.LOOK_MINERALS }
}

// Export `Mineral` to runtime globals
Game.registerGlobal(Mineral);
declare module 'xxscreeps/game/runtime' {
	interface Global { Mineral: typeof Mineral }
}

// Register `Creep.harvest` target
const harvest = registerHarvestable(Mineral, function(creep) {
	return chainIntentChecks(
		() => checkCommon(creep, C.WORK),
		() => checkTarget(this, Mineral),
		() => checkRange(creep, this, 1),
		() => {
			if (this.mineralAmount <= 0) {
				return C.ERR_NOT_ENOUGH_RESOURCES;
			}
			const extractor = lookForStructureAt(this.room, this.pos, C.STRUCTURE_EXTRACTOR);
			if (!extractor) {
				return C.ERR_NOT_FOUND;
			} else if (extractor.my !== true) {
				return C.ERR_NOT_OWNER;
			} else if (extractor.cooldown !== 0 && extractor.cooldown !== C.EXTRACTOR_COOLDOWN) {
				return C.ERR_TIRED;
			}
			return C.OK;
		},
	);
});
declare module 'xxscreeps/mods/harvestable' {
	interface Harvest { mineral: typeof harvest }
}
