import * as C from '~/game/constants';
import * as Game from '~/game/game';
import type { Shape } from '~/engine/schema/road';
import { withOverlay } from '~/lib/schema';
import { Structure } from '.';

export class StructureRoad extends withOverlay<Shape>()(Structure) {
	get structureType() { return C.STRUCTURE_ROAD }
	get ticksToDecay() { return Math.max(0, this._nextDecayTime - Game.time) }
}
