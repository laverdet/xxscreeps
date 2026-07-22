import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { chainIntentChecks, checkRange, checkTarget } from 'xxscreeps/game/checks.js';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room/index.js';
import { registerHarvestable } from 'xxscreeps/mods/classic/harvestable/game.js';
import { compose } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';
import { lookForStructureAt } from '../structure/structure.js';
import { StructureExtractor } from './extractor.js';
import { Mineral } from './mineral.js';
import { extractorShape, mineralShape } from './schema.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const extractorSchema = registerVariant('Room.objects', compose(extractorShape, StructureExtractor));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mineralSchema = registerVariant('Room.objects', compose(mineralShape, Mineral));

// Register FIND_ type for `Mineral`
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const find = registerFindHandlers({
	[C.FIND_MINERALS]: room =>
		room['#lookFor'](C.LOOK_MINERALS),
});

// Register LOOK_ type for `Mineral`
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const look = registerLook<Mineral>()(C.LOOK_MINERALS);

// Register `Creep.harvest` target
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const harvest = registerHarvestable(Mineral, function(creep) {
	return chainIntentChecks(
		() => checkTarget(this, Mineral),
		() => {
			if (this.mineralAmount <= 0) {
				return C.ERR_NOT_ENOUGH_RESOURCES;
			}
		},
		() => checkRange(creep, this, 1),
		() => {
			const extractor = lookForStructureAt(this.room, this.pos, C.STRUCTURE_EXTRACTOR);
			if (!extractor) {
				return C.ERR_NOT_FOUND;
			} else if (extractor.my === false || !creep.my) {
				return C.ERR_NOT_OWNER;
			} else if (!extractor.isActive()) {
				return C.ERR_RCL_NOT_ENOUGH;
			} else if (extractor.cooldown !== 0) {
				return C.ERR_TIRED;
			}
		});
});

// ---

declare module 'xxscreeps:mods/game' {
	interface Find { mineral: typeof find }
	interface Look { mineral: typeof look }
	interface RoomSchema { mineral: [ typeof extractorSchema, typeof mineralSchema ] }
}

declare module 'xxscreeps/game/runtime.js' {
	interface Global { Mineral: typeof Mineral }
}

declare module 'xxscreeps/mods/classic/harvestable/game.js' {
	interface Harvest { mineral: typeof harvest }
}
