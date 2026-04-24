import { chainIntentChecks, checkRange, checkTarget } from 'xxscreeps/game/checks.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game, registerGlobal } from 'xxscreeps/game/index.js';
import * as RoomObject from 'xxscreeps/game/object.js';
import { checkCommon } from 'xxscreeps/mods/creep/creep.js';
import { registerHarvestable } from 'xxscreeps/mods/harvestable/index.js';
import { resourceEnumFormat } from 'xxscreeps/mods/resource/resource.js';
import { lookForStructureAt } from 'xxscreeps/mods/structure/structure.js';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema/index.js';
import { assign } from 'xxscreeps/utility/utility.js';

export const format = declare('Mineral', () => compose(shape, Mineral));
const shape = struct(RoomObject.format, {
	...variant('mineral'),
	density: 'int32',
	mineralAmount: 'int32',
	mineralType: resourceEnumFormat,
	'#nextRegenerationTime': 'int32',
});

// Game object declaration
export class Mineral extends withOverlay(RoomObject.RoomObject, shape) {

	constructor(idOrArg1?: any, arg2?: any) {
		super(idOrArg1, arg2);
		if (typeof idOrArg1 === 'string') assign<Mineral>(this, RoomObject.getById(Mineral, idOrArg1));
	}

	@enumerable get ticksToRegeneration() {
		const nextTime = this['#nextRegenerationTime'];
		return nextTime === 0 ? undefined : Math.max(0, nextTime - Game.time);
	}

	get '#lookType'() { return C.LOOK_MINERALS; }
}

// Export `Mineral` to runtime globals
registerGlobal(Mineral);
declare module 'xxscreeps/game/runtime.js' {
	interface Global { Mineral: typeof Mineral }
}

// Register `Creep.harvest` target
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
			} else if (extractor['#user'] && extractor['#user'] !== creep['#user']) {
				return C.ERR_NOT_OWNER;
			} else if (!extractor.isActive()) {
				return C.ERR_RCL_NOT_ENOUGH;
			} else if (extractor.cooldown !== 0 && extractor.cooldown !== C.EXTRACTOR_COOLDOWN) {
				return C.ERR_TIRED;
			}
		});
});
declare module 'xxscreeps/mods/harvestable/index.js' {
	interface Harvest { mineral: typeof harvest }
}
