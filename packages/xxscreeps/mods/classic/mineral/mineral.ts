import * as C from 'xxscreeps/game/constants/index.js';
import { registerGlobal } from 'xxscreeps/game/index.js';
import { RoomObject, optionalExpiryTime } from 'xxscreeps/game/object.js';
import { withOverlay } from 'xxscreeps/schema/index.js';
import { mineralShape } from './schema.js';

// Game object declaration
export class Mineral extends withOverlay(RoomObject, mineralShape) {
	@enumerable get ticksToRegeneration() { return optionalExpiryTime(this['#nextRegenerationTime']); }

	get '#lookType'() { return C.LOOK_MINERALS; }
}

// Export `Mineral` to runtime globals
registerGlobal(Mineral);
