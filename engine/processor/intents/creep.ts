import * as C from '~/game/constants';
import * as Game from '~/game/game';
import * as Creep from '~/game/objects/creep';
import type { ConstructionSite } from '~/game/objects/construction-site';
import type { Source } from '~/game/objects/source';
import type { Resource } from '~/game/objects/resource';
import type { Structure } from '~/game/objects/structures';
import type { StructureController } from '~/game/objects/structures/controller';
import type { Direction, RoomPosition } from '~/game/position';
import * as Room from '~/game/room';
import { bindProcessor } from '~/engine/processor/bind';
import type { ResourceType, RoomObjectWithStore } from '~/game/store';
import { instantiate } from '~/lib/utility';
import * as StructureControllerIntent from './controller';
import * as Movement from './movement';
import * as ResourceIntent from './resource';
import { newRoomObject } from './room-object';
import * as StoreIntent from './store';

type Parameters = {
	build: { target: string };
	harvest: { target: string };
	move: { direction: Direction };
	pickup: string;
	transfer: {
		amount?: number;
		resourceType: ResourceType;
		target: string;
	};
	suicide: boolean;
	upgradeController: { target: string };
	withdraw: {
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
			const target = Game.getObjectById<ConstructionSite>(id)!;
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
			const target = Game.getObjectById<Source>(id)!;
			if (Creep.checkHarvest(this, target) === C.OK) {
				const amount = Math.min(target.energy, this.store.getFreeCapacity('energy'), 25);
				StoreIntent.add(this.store, 'energy', amount);
				target.energy -= amount;
			}
		}

		if (intent.move) {
			const { direction } = intent.move;
			if (Creep.checkMove(this, direction) === C.OK) {
				Movement.add(this, direction);
			}
		}

		if (intent.pickup !== undefined) {
			const resource = Game.getObjectById<Resource>(intent.pickup)!;
			if (Creep.checkPickup(this, resource) === C.OK) {
				const amount = Math.min(this.store.getFreeCapacity(resource.resourceType), resource.amount);
				StoreIntent.add(this.store, resource.resourceType, amount);
				resource.amount -= amount;
			}
		}

		if (intent.suicide) {
			if (this.my) {
				Room.removeObject(this);
			}
		}

		if (intent.transfer) {
			const { amount, resourceType, target: id } = intent.transfer;
			const target = Game.getObjectById<RoomObjectWithStore>(id)!;
			if (Creep.checkTransfer(this, target, resourceType, amount) === C.OK) {
				const transferAmount = Math.min(this.store[resourceType]!, target.store.getFreeCapacity(resourceType));
				StoreIntent.subtract(this.store, resourceType, transferAmount);
				StoreIntent.add(target.store, resourceType, transferAmount);
			}
		}

		if (intent.upgradeController) {
			const target = Game.getObjectById<StructureController>(intent.upgradeController.target)!;
			if (Creep.checkUpgradeController(this, target) === C.OK) {
				const power = 2;
				const amount = Math.min(power, this.store.energy);
				StoreIntent.subtract(this.store, 'energy', amount);
				StructureControllerIntent.upgrade(target, amount);
			}
		}

		if (intent.withdraw) {
			const { amount, resourceType, target: id } = intent.withdraw;
			const target = Game.getObjectById<Extract<RoomObjectWithStore, Structure>>(id)!;
			if (Creep.checkWithdraw(this, target, resourceType, amount) === C.OK) {
				const transferAmount = Math.min(this.store.getFreeCapacity(resourceType), target.store[resourceType]!);
				StoreIntent.subtract(target.store, resourceType, transferAmount);
				StoreIntent.add(this.store, resourceType, transferAmount);
			}
		}

		return false;
	},

	tick() {
		if (Game.time >= this._ageTime && this._ageTime !== 0) {
			for (const [ resourceType, amount ] of Object.entries(this.store)) {
				ResourceIntent.drop(this.pos, resourceType as ResourceType, amount);
			}
			Room.removeObject(this);
			return true;
		}
		const nextPosition = Movement.get(this);
		if (nextPosition) {
			Room.moveObject(this, nextPosition);
			return true;
		}
		return false;
	},
});
