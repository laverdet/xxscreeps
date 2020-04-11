import * as C from '~/game/constants';
import type { shape } from '~/engine/schema/storage';
import { withOverlay } from '~/lib/schema';
import { Structure } from '.';

export class StructureStorage extends withOverlay<typeof shape>()(Structure) {
	get structureType() { return C.STRUCTURE_STORAGE }
}
