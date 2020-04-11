import * as C from '~/game/constants';
import type { RoomPosition } from '~/game/position';
import { instantiate } from '~/lib/utility';
import { StructureTower } from '~/game/objects/structures/tower';
import { newRoomObject } from './room-object';
import * as StoreIntent from './store';

export function create(pos: RoomPosition, owner: string) {
	return instantiate(StructureTower, {
		...newRoomObject(pos),
		hits: C.TOWER_HITS,
		store: StoreIntent.create(null, { energy: C.TOWER_CAPACITY }),
		_owner: owner,
	});
}
