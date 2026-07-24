import { registerVariant } from 'xxscreeps/engine/schema/index.js';
import { chainIntentChecks, checkRange, checkTarget } from 'xxscreeps/game/checks.js';
import { registerFindHandlers, registerLook } from 'xxscreeps/game/room/index.js';
import { registerGlobal } from 'xxscreeps/game/symbols.js';
import { registerHarvestable } from 'xxscreeps/mods/classic/harvestable/game.js';
import { compose } from 'xxscreeps/schema/index.js';
import * as C from 'xxscreeps:mods/constants';
import { StructureKeeperLair } from './keeper-lair.js';
import { keeperLairShape, sourceShape } from './schema.js';
import { Source } from './source.js';

// Export `Source` and `StructureKeeperLair` to runtime globals
registerGlobal(Source);
registerGlobal(StructureKeeperLair);

// Register FIND_ types for `Source`
export type SourceFind = typeof find;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const find = registerFindHandlers({
	[C.FIND_SOURCES]: room =>
		room['#lookFor'](C.LOOK_SOURCES),
	[C.FIND_SOURCES_ACTIVE]: room =>
		room['#lookFor'](C.LOOK_SOURCES).filter(source => source.energy > 0),
});

// Register LOOK_ type for `Source`
export type SourceLook = [ typeof look ];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const look = registerLook<Source>()(C.LOOK_SOURCES);

// Register `Creep.harvest` target
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const harvest = registerHarvestable(Source, function(creep) {
	return chainIntentChecks(
		() => checkTarget(this, Source),
		() => {
			if (this.energy <= 0) {
				return C.ERR_NOT_ENOUGH_RESOURCES;
			}
		},
		() => checkRange(creep, this, 1),
		() => {
			const roomUser = this.room['#user'];
			if (roomUser != null && roomUser !== creep['#user']) {
				return C.ERR_NOT_OWNER;
			}
		});
});

// Register schema extensions
export type SourceRoomSchemas = [ typeof sourceSchema, typeof keeperLairSchema ];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const sourceSchema = registerVariant('Room.objects', compose(sourceShape, Source));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const keeperLairSchema = registerVariant('Room.objects', compose(keeperLairShape, StructureKeeperLair));

// ---

declare module 'xxscreeps/game/runtime.js' {
	interface Global {
		Source: typeof Source;
		StructureKeeperLair: typeof StructureKeeperLair;
	}
}

declare module 'xxscreeps/mods/classic/harvestable/game.js' {
	interface Harvest { source: typeof harvest }
}
