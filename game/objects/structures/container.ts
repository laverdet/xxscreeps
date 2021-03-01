import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import * as Store from 'xxscreeps/game/store';
import * as Structure from '.';

export function format() { return compose(shape, StructureContainer) }
const shape = declare('Container', struct(Structure.format, {
	...variant('container'),
	store: Store.format,
	_nextDecayTime: 'int32',
}));

export class StructureContainer extends withOverlay(shape)(Structure.Structure) {
	get storeCapacity() { return this.store.getCapacity(C.RESOURCE_ENERGY) }
	get structureType() { return C.STRUCTURE_CONTAINER }
	get ticksToDecay() { return Math.max(0, this._nextDecayTime - Game.time) }
}
