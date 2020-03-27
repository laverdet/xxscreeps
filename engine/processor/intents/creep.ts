import * as C from '~/game/constants';
import * as Creep from '~/game/objects/creep';
import { getPositonInDirection, Direction, RoomPosition } from '~/game/position';
import { bindProcessor } from '~/engine/processor/bind';
import { generateId } from '~/engine/util/id';
import { ResourceType, RoomObjectWithStore } from '~/game/store';
import { instantiate } from '~/lib/utility';
import * as Store from './store';

type Parameters = {
	harvest: { target: string };
	move: { direction: Direction };
	transfer: {
		amount?: number;
		resourceType: ResourceType;
		target: string;
	};
};

export type Intents = {
	receiver: Creep.Creep;
	parameters: Parameters;
};

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
	process(intent: Partial<Parameters>) {
		if (intent.harvest) {
			Store.add(this.store, 'energy', 25);
		}
		if (intent.move) {
			this.pos = getPositonInDirection(this.pos, intent.move.direction);
			return true;
		}
		if (intent.transfer) {
			const { amount, resourceType, target: id } = intent.transfer;
			const target = Game.getObjectById(id) as RoomObjectWithStore | undefined;
			if (Creep.checkTransfer(this, target, resourceType, amount) !== C.OK) {
				return false;
			}
			const transferAmount = Math.min(this.store[resourceType]!, target!.store.getFreeCapacity(resourceType));
			Store.subtract(this.store, resourceType, transferAmount);
			Store.add(target!.store, resourceType, transferAmount);
		}
		return false;
	},
});
