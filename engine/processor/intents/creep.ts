import * as C from '~/game/constants';
import * as Game from '~/game/game';
import * as Creep from '~/game/objects/creep';
import type { ConstructionSite } from '~/game/objects/construction-site';
import type { Source } from '~/game/objects/source';
import type { StructureController } from '~/game/objects/structures/controller';
import { Direction, RoomPosition } from '~/game/position';
import { bindProcessor } from '~/engine/processor/bind';
import type { ResourceType, RoomObjectWithStore } from '~/game/store';
import { instantiate } from '~/lib/utility';
import * as StructureControllerIntent from './controller';
import * as Movement from './movement';
import { newRoomObject } from './room-object';
import * as RoomIntent from './room';
import * as StoreIntent from './store';

type Parameters = {
	build: { target: string };
	harvest: { target: string };
	move: { direction: Direction };
	transfer: {
		amount?: number;
		resourceType: ResourceType;
		target: string;
	};
	suicide: boolean;
	upgradeController: { target: string };
};

export type Intents = {
	receiver: Creep.Creep;
	parameters: Parameters;
};

export function create(body: C.BodyPart[], pos: RoomPosition, name: string, owner: string) {
	const carryCapacity = body.reduce((energy, type) =>
		(type === C.CARRY ? energy + C.CARRY_CAPACITY : energy), 0);
	return instantiate(Creep.Creep, {
		...newRoomObject(pos),
		body: body.map(type => ({ type, hits: 100, boost: undefined })),
		fatigue: 0,
		hits: body.length,
		name,
		store: StoreIntent.create(carryCapacity),
		_ageTime: 0,
		_owner: owner,
	});
}

export default () => bindProcessor(Creep.Creep, {
	process(intent: Partial<Parameters>) {
		if (intent.build) {
			const { target: id } = intent.build;
			const target = Game.getObjectById(id) as ConstructionSite;
			if (Creep.checkBuild(this, target) === C.OK) {
				const power = 2;
				const energy = Math.min(
					target.progressTotal - target.progress,
					this.store.energy,
					power,
				);
				if (energy > 0) {
					StoreIntent.subtract(this.store, 'energy', energy);
					target.progress += energy;
				}
			}

		} else if (intent.harvest) {
			const { target: id } = intent.harvest;
			const target = Game.getObjectById(id) as Source | undefined;
			if (Creep.checkHarvest(this, target) === C.OK) {
				const amount = Math.min(target!.energy, 25);
				StoreIntent.add(this.store, 'energy', 25);
				target!.energy -= amount;
			}
		}

		if (intent.move) {
			const { direction } = intent.move;
			if (Creep.checkMove(this, direction) === C.OK) {
				Movement.add(this, direction);
			}
		}

		if (intent.transfer) {
			const { amount, resourceType, target: id } = intent.transfer;
			const target = Game.getObjectById(id) as RoomObjectWithStore | undefined;
			if (Creep.checkTransfer(this, target, resourceType, amount) === C.OK) {
				const transferAmount = Math.min(this.store[resourceType]!, target!.store.getFreeCapacity(resourceType));
				StoreIntent.subtract(this.store, resourceType, transferAmount);
				StoreIntent.add(target!.store, resourceType, transferAmount);
			}
		}

		if (intent.upgradeController) {
			const target = Game.getObjectById(intent.upgradeController.target) as StructureController;
			if (Creep.checkUpgradeController(this, target) === C.OK) {
				StoreIntent.subtract(this.store, 'energy', 2);
				StructureControllerIntent.upgrade(target, 2);
			}
		}

		if (intent.suicide) {
			if (this.my) {
				RoomIntent.removeObject(this.room, this);
			}
		}
		return false;
	},

	tick() {
		if (Game.time >= this._ageTime && this._ageTime !== 0) {
			RoomIntent.removeObject(this.room, this);
			return true;
		}
		const nextPosition = Movement.get(this);
		if (nextPosition) {
			this.pos = nextPosition;
			return true;
		}
		return false;
	},
});
