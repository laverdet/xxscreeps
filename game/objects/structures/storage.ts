import * as C from 'xxscreeps/game/constants';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import * as Store from 'xxscreeps/game/store';
import * as Structure from '.';

export function format() { return compose(shape, StructureStorage) }
const shape = declare('Storage', struct(Structure.format, {
	...variant('storage'),
	store: Store.format,
}));

export class StructureStorage extends withOverlay(shape)(Structure.Structure) {
	get structureType() { return C.STRUCTURE_STORAGE }
}
