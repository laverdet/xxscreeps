import * as C from '~/engine/game/constants';
import * as Creep from '~/engine/game/objects/creep';
import { getPositonInDirection, RoomPosition } from '~/engine/game/position';
import { bindProcessor } from '~/engine/processor/bind';
import { generateId } from '~/engine/util/id';
import { instantiate } from '~/lib/utility';
import * as Store from './store';

export function create(body: C.BodyPart[], pos: RoomPosition, name: string, owner: string) {
	const carryCapacity = body.reduce((energy, type) =>
		(type === C.CARRY ? energy + C.CARRY_CAPACITY : energy), 0);
	return instantiate(Creep.Creep, {
		id: generateId(),
		pos,
		body: body.map(type => ({ type, hits: 100, boost: undefined })),
		effects: [],
		fatigue: 0,
		hits: body.length,
		name,
		store: Store.create(carryCapacity),
		[Creep.AgeTime]: 0,
		[Creep.Owner]: owner,
	});
}

export default () => bindProcessor(Creep.Creep, {
	process(this: Creep.Creep, intent) {
		if (intent.harvest) {
			Store.add.call(this.store, 'energy', 2);
		}
		if (intent.move) {
			this.pos = getPositonInDirection(this.pos, (intent.move as any).direction);
			return true;
		}
		if (intent.transfer) {
			Store.subtract.call(this.store, 'energy', this.store.energy);
		}
		return false;
	},
});
