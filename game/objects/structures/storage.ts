import * as C from '~/game/constants';
import type { Shape } from '~/engine/schema/storage';
import { withOverlay } from '~/lib/schema';
import { Structure } from '.';

export class StructureStorage extends withOverlay<Shape>()(Structure) {
	get structureType() { return C.STRUCTURE_STORAGE }
}
