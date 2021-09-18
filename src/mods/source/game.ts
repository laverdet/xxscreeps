import C from 'xxscreeps/game/constants';
import { registerStruct, registerVariant } from 'xxscreeps/engine/schema';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room';
import { chainIntentChecks, checkRange, checkTarget } from 'xxscreeps/game/checks';
import { checkCommon } from 'xxscreeps/mods/creep/creep';
import { registerHarvestable } from 'xxscreeps/mods/harvestable';
import { format as keeperFormat } from './keeper-lair';
import { Source, format } from './source';

// Register schema extensions
const sourceSchema = registerVariant('Room.objects', format);
const keeperLairSchema = registerVariant('Room.objects', keeperFormat);
const roomSchema = registerStruct('Room', {
	'#cumulativeEnergyHarvested': 'int32',
});
declare module 'xxscreeps/game/room' {
	interface Schema { source: [ typeof sourceSchema, typeof keeperLairSchema, typeof roomSchema ] }
}

// Register FIND_ types for `Source`
const find = registerFindHandlers({
	[C.FIND_SOURCES]: room =>
		room['#lookFor'](C.LOOK_SOURCES),
	[C.FIND_SOURCES_ACTIVE]: room =>
		room['#lookFor'](C.LOOK_SOURCES).filter(source => source.energy > 0),
});

// Register LOOK_ type for `Source`
const look = registerLook<Source>()(C.LOOK_SOURCES);
declare module 'xxscreeps/game/room' {
	interface Find { source: typeof find }
	interface Look { source: typeof look }
}

// Register `Creep.harvest` target
const harvest = registerHarvestable(Source, function(creep) {
	return chainIntentChecks(
		() => checkCommon(creep, C.WORK),
		() => checkTarget(this, Source),
		() => checkRange(creep, this, 1),
		() => {
			const roomUser = this.room['#user'];
			if (roomUser != null && roomUser !== creep['#user']) {
				return C.ERR_NOT_OWNER;
			} else if (this.energy <= 0) {
				return C.ERR_NOT_ENOUGH_RESOURCES;
			}
		});
});
declare module 'xxscreeps/mods/harvestable' {
	interface Harvest { source: typeof harvest }
}
