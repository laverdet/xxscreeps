import * as C from 'xxscreeps/game/constants';
import type { RoomPosition } from 'xxscreeps/game/position';
import { instantiate } from 'xxscreeps/util/utility';
import { StructureStorage } from 'xxscreeps/game/objects/structures/storage';
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
