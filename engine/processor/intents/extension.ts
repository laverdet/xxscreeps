import * as C from '~/game/constants';
import type { RoomPosition } from '~/game/position';
import { instantiate } from '~/lib/utility';
import { StructureExtension } from '~/game/objects/structures/extension';
import { newRoomObject } from './room-object';
import * as StoreIntent from './store';

export function create(pos: RoomPosition, level: number, owner: string) {
	const energyCapacity = C.EXTENSION_ENERGY_CAPACITY[level];
	return instantiate(StructureExtension, {
		...newRoomObject(pos),
		hits: C.EXTENSION_HITS,
		store: StoreIntent.create(energyCapacity, { energy: energyCapacity }),
		_owner: owner,
	});
}
