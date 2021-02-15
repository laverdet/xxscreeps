import * as C from 'xxscreeps/game/constants';
import type { RoomPosition } from 'xxscreeps/game/position';
import { instantiate } from 'xxscreeps/util/utility';
import { StructureTower } from 'xxscreeps/game/objects/structures/tower';
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
