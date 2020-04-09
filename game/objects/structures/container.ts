import * as C from '~/game/constants';
import * as Game from '~/game/game';
import type { shape } from '~/engine/schema/container';
import { withOverlay } from '~/lib/schema';
import { Structure } from '.';

export class StructureContainer extends withOverlay<typeof shape>()(Structure) {
	get storeCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) }
	get structureType() { return C.STRUCTURE_EXTENSION }
	get ticksToDecay() { return Math.max(0, this._nextDecayTime - Game.time) }
}
