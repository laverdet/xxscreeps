import * as C from 'xxscreeps/game/constants';
import type { Shape } from 'xxscreeps/engine/schema/storage';
import { withOverlay } from 'xxscreeps/schema';
import { Structure } from '.';

export class StructureStorage extends withOverlay<Shape>()(Structure) {
	get structureType() { return C.STRUCTURE_STORAGE }
}
