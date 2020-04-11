import * as C from '~/game/constants';
import type { RoomPosition } from '~/game/position';
import { instantiate } from '~/lib/utility';
import { StructureStorage } from '~/game/objects/structures/storage';
import { newRoomObject } from './room-object';
import * as StoreIntent from './store';

export function create(pos: RoomPosition, owner: string) {
	return instantiate(StructureStorage, {
		...newRoomObject(pos),
		hits: C.STORAGE_HITS,
		store: StoreIntent.create(C.STORAGE_CAPACITY),
		_owner: owner,
	});
}
