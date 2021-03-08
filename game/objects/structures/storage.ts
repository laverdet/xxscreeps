import type { RoomPosition } from 'xxscreeps/game/position';
import * as C from 'xxscreeps/game/constants';
import * as RoomObject from 'xxscreeps/game/object';
import * as Store from 'xxscreeps/mods/resource/store';
import * as Structure from '.';
import { compose, declare, struct, variant, withOverlay } from 'xxscreeps/schema';
import { assign } from 'xxscreeps/util/utility';

export function format() { return compose(shape, StructureStorage) }
const shape = declare('Storage', struct(Structure.format, {
	...variant('storage'),
	store: Store.format,
}));

export class StructureStorage extends withOverlay(Structure.Structure, shape) {
	get structureType() { return C.STRUCTURE_STORAGE }
}

export function create(pos: RoomPosition, owner: string) {
	return assign(RoomObject.create(new StructureStorage, pos), {
		hits: C.STORAGE_HITS,
		store: Store.create(C.STORAGE_CAPACITY),
		_owner: owner,
	});
}
