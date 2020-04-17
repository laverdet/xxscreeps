import * as C from '~/game/constants';
import * as Game from '~/game/game';
import { Creep, PartType } from '~/game/objects/creep';
// eslint-disable-next-line no-duplicate-imports
import * as CreepLib from '~/game/objects/creep';
import type { ConstructionSite } from '~/game/objects/construction-site';
import type { Source } from '~/game/objects/source';
import type { Resource } from '~/game/objects/resource';
import type { Structure } from '~/game/objects/structures';
import type { StructureController } from '~/game/objects/structures/controller';
import { StructureRoad } from '~/game/objects/structures/road';
import type { Direction, RoomPosition } from '~/game/position';
import * as Room from '~/game/room';
import { bindProcessor } from '~/engine/processor/bind';
import type { ResourceType, RoomObjectWithStore } from '~/game/store';
import { accumulate, instantiate, firstMatching } from '~/lib/utility';
import * as StructureControllerIntent from './controller';
import * as Movement from './movement';
// eslint-disable-next-line no-duplicate-imports
import { calculateWeight } from './movement';
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
	suicide: true;
	upgradeController: { target: string };
	withdraw: {
		amount?: number;
		resourceType: ResourceType;
		target: string;
	};
};

export type Intents = {
	receiver: Creep;
	parameters: Parameters;
};

export function create(body: PartType[], pos: RoomPosition, name: string, owner: string) {
	const carryCapacity = body.reduce((energy, type) =>
		(type === C.CARRY ? energy + C.CARRY_CAPACITY : energy), 0);
	return instantiate(Creep, {
		...newRoomObject(pos),
		body: body.map(type => ({ type, hits: 100, boost: undefined })),
		fatigue: 0,
		hits: body.length * 100,
		name,
		store: StoreIntent.create(carryCapacity),
		_ageTime: 0,
		_owner: owner,
	});
}

export default () => bindProcessor(Creep, {
	process(intent: Partial<Parameters>) {
		if (intent.build) {
			const { target: id } = intent.build;
			const target = Game.getObjectById<ConstructionSite>(id)!;
			if (CreepLib.checkBuild(this, target) === C.OK) {
				const power = calculatePower(this, C.WORK, C.BUILD_POWER);
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
			if (CreepLib.checkHarvest(this, target) === C.OK) {
				const power = calculatePower(this, C.WORK, C.HARVEST_POWER);
				const energy = Math.min(target.energy, power);
				const overflow = Math.max(energy - this.store.getFreeCapacity('energy'), 0);
				StoreIntent.add(this.store, 'energy', energy - overflow);
				target.energy -= energy;
				if (overflow > 0) {
					ResourceIntent.drop(this.pos, 'energy', overflow);
				}
			}
		}

		if (intent.move) {
			const { direction } = intent.move;
			if (CreepLib.checkMove(this, direction) === C.OK) {
				Movement.add(this, direction);
			}
		}

		if (intent.pickup !== undefined) {
			const resource = Game.getObjectById<Resource>(intent.pickup)!;
			if (CreepLib.checkPickup(this, resource) === C.OK) {
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
			if (CreepLib.checkTransfer(this, target, resourceType, amount) === C.OK) {
				const transferAmount = Math.min(this.store[resourceType]!, target.store.getFreeCapacity(resourceType));
				StoreIntent.subtract(this.store, resourceType, transferAmount);
				StoreIntent.add(target.store, resourceType, transferAmount);
			}
		}

		if (intent.upgradeController) {
			const target = Game.getObjectById<StructureController>(intent.upgradeController.target)!;
			if (CreepLib.checkUpgradeController(this, target) === C.OK) {
				const power = calculatePower(this, C.WORK, C.UPGRADE_CONTROLLER_POWER);
				const energy = Math.min(power, this.store.energy);
				StoreIntent.subtract(this.store, 'energy', energy);
				StructureControllerIntent.upgrade(target, energy);
			}
		}

		if (intent.withdraw) {
			const { amount, resourceType, target: id } = intent.withdraw;
			const target = Game.getObjectById<Extract<RoomObjectWithStore, Structure>>(id)!;
			if (CreepLib.checkWithdraw(this, target, resourceType, amount) === C.OK) {
				const transferAmount = Math.min(this.store.getFreeCapacity(resourceType), target.store[resourceType]!);
				StoreIntent.subtract(target.store, resourceType, transferAmount);
				StoreIntent.add(this.store, resourceType, transferAmount);
			}
		}

		return false;
	},

	tick() {
		// Check creep age death
		if (Game.time >= this._ageTime && this._ageTime !== 0) {
			for (const [ resourceType, amount ] of Object.entries(this.store) as [ ResourceType, number ][]) {
				ResourceIntent.drop(this.pos, resourceType, amount);
			}
			Room.removeObject(this);
			return true;
		}

		// Dispatch movements
		const nextPosition = Movement.get(this);
		if (nextPosition) {
			// Move the creep
			Room.moveObject(this, nextPosition);
			// Calculate base fatigue from plain/road/swamp
			const fatigue = (() => {
				const road = firstMatching(
					this.room.lookForAt(C.LOOK_STRUCTURES, nextPosition),
					(look): look is Room.LookType<StructureRoad> => look.structure.structureType === 'road');
				if (road) {
					// Update road decay
					road.structure._nextDecayTime -= C.ROAD_WEAROUT * this.body.length;
					return 1;
				}
				const terrain = this.room.getTerrain().get(nextPosition.x, nextPosition.y);
				if (terrain === C.TERRAIN_MASK_SWAMP) {
					return 10;
				} else {
					return 2;
				}
			})();
			// Update fatigue
			this.fatigue = Math.max(0,
				calculateWeight(this) * fatigue - calculatePower(this, C.MOVE, 2));

		} else if (this.fatigue > 0) {
			// Reduce fatigue
			this.fatigue -= Math.min(this.fatigue, calculatePower(this, C.MOVE, 2));
		}
		return false;
	},
});

export function calculatePower(creep: Creep, part: PartType, power: number) {
	return accumulate(creep.body, bodyPart => {
		if (bodyPart.type === part && bodyPart.hits > 0) {
			return power;
		}
		return 0;
	});
}
