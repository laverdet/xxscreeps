import * as C from 'xxscreeps/game/constants';
import { Creep, PartType } from 'xxscreeps/game/objects/creep';
import type { RoomPosition } from 'xxscreeps/game/position';
import { instantiate } from 'xxscreeps/util/utility';
import { ActionLog } from 'xxscreeps/game/objects/action-log';

import { newRoomObject } from './room-object';
import * as StoreIntent from './store';

export function create(body: PartType[], pos: RoomPosition, name: string, owner: string) {
	const carryCapacity = body.reduce((energy, type) =>
		(type === C.CARRY ? energy + C.CARRY_CAPACITY : energy), 0);
	return instantiate(Creep, {
		...newRoomObject(pos),
		[ActionLog]: [],
		body: body.map(type => ({ type, hits: 100, boost: undefined })),
		fatigue: 0,
		hits: body.length * 100,
		name,
		store: StoreIntent.create(carryCapacity),
		_ageTime: 0,
		_owner: owner,
	});
}
