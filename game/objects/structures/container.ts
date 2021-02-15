import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import type { Shape } from 'xxscreeps/engine/schema/container';
import { withOverlay } from 'xxscreeps/schema';
import { Structure } from '.';

export class StructureContainer extends withOverlay<Shape>()(Structure) {
	get storeCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) }
	get structureType() { return C.STRUCTURE_CONTAINER }
	get ticksToDecay() { return Math.max(0, this._nextDecayTime - Game.time) }
}
