import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { chainIntentChecks, checkCooldown, checkRange, checkTarget } from 'xxscreeps/game/checks.js';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room/index.js';
import { registerHarvestable } from 'xxscreeps/mods/classic/harvestable/game.js';
import { compose } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';
import { checkIsActive, lookForStructureAt } from '../structure/structure.js';
import { StructureExtractor } from './extractor.js';
import { Mineral } from './mineral.js';
import { extractorShape, mineralShape } from './schema.js';

export type MineralRoomSchemas = [ typeof extractorSchema, typeof mineralSchema ];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const extractorSchema = registerVariant('Room.objects', compose(extractorShape, StructureExtractor));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mineralSchema = registerVariant('Room.objects', compose(mineralShape, Mineral));

// Register FIND_ type for `Mineral`
export type MineralFind = typeof find;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const find = registerFindHandlers({
	[C.FIND_MINERALS]: room =>
		room['#lookFor'](C.LOOK_MINERALS),
});

// Register LOOK_ type for `Mineral`
export type MineralLook = [ typeof look ];
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
			}
			return chainIntentChecks(
				() => extractor.my === false || !creep.my ? C.ERR_NOT_OWNER : C.OK,
				() => checkIsActive(extractor),
				() => checkCooldown(extractor));
		});
});

// ---

declare module 'xxscreeps/game/runtime.js' {
	interface Global { Mineral: typeof Mineral }
}

declare module 'xxscreeps/mods/classic/harvestable/game.js' {
	interface Harvest { mineral: typeof harvest }
}
