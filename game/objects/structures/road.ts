import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import type { Shape } from 'xxscreeps/engine/schema/road';
import { withOverlay } from 'xxscreeps/schema';
import { Structure } from '.';

export class StructureRoad extends withOverlay<Shape>()(Structure) {
	get structureType() { return C.STRUCTURE_ROAD }
	get ticksToDecay() { return Math.max(0, this._nextDecayTime - Game.time) }
}
