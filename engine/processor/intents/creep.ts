import * as C from '~/engine/game/constants';
import * as Creep from '~/engine/game/objects/creep';
import { RoomPosition } from '~/engine/game/position';
import { generateId } from '~/engine/util/id';
import { instantiate } from '~/lib/utility';
import * as Store from './store';

export function create(body: C.BodyPart[], pos: RoomPosition, name: string, owner: string) {
	const carryCapacity = body.reduce((sum, part) =>
		(part === C.CARRY ? sum + C.CARRY_CAPACITY : sum), 0);
	return instantiate(Creep.Creep, {
		id: generateId(),
		pos,
		effects: [],
		carry: Store.create(carryCapacity),
		fatigue: 0,
		hits: body.length,
		name,
		[Creep.AgeTime]: 0,
		[Creep.Owner]: owner,
	});
}
