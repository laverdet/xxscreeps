import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import { Creep, PartType } from 'xxscreeps/game/objects/creep';
// eslint-disable-next-line no-duplicate-imports
import * as CreepLib from 'xxscreeps/game/objects/creep';
import type { ConstructionSite } from 'xxscreeps/game/objects/construction-site';
import type { Resource } from 'xxscreeps/game/objects/resource';
import type { Structure } from 'xxscreeps/game/objects/structures';
import type { StructureController } from 'xxscreeps/game/objects/structures/controller';
import { StructureRoad } from 'xxscreeps/game/objects/structures/road';
import type { Direction, RoomPosition } from 'xxscreeps/game/position';
import * as Room from 'xxscreeps/game/room';
import type { ResourceType, RoomObjectWithStore } from 'xxscreeps/game/store';
import { accumulate, instantiate, firstMatching } from 'xxscreeps/util/utility';
import { registerIntentProcessor, registerTickProcessor } from 'xxscreeps/processor';
import * as StructureControllerIntent from './controller';
import * as Movement from './movement';
// eslint-disable-next-line no-duplicate-imports
import { calculateWeight } from './movement';
import * as ResourceIntent from './resource';
import { newRoomObject } from './room-object';
import * as StoreIntent from './store';

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

declare module 'xxscreeps/processor' {
	interface Intent { creep: typeof intents }
}
const intents = [
	registerIntentProcessor(Creep, 'build', (creep, id: string) => {
		const target = Game.getObjectById<ConstructionSite>(id)!;
		if (CreepLib.checkBuild(creep, target) === C.OK) {
			const power = calculatePower(creep, C.WORK, C.BUILD_POWER);
			const energy = Math.min(
				target.progressTotal - target.progress,
				creep.store.energy,
				power,
			);
			if (energy > 0) {
				StoreIntent.subtract(creep.store, 'energy', energy);
				target.progress += energy;
			}
		}
	}),

	registerIntentProcessor(Creep, 'move', (creep, direction: Direction) => {
		if (CreepLib.checkMove(creep, direction) === C.OK) {
			Movement.add(creep, direction);
		}
	}),

	registerIntentProcessor(Creep, 'pickup', (creep, id: string) => {
		const resource = Game.getObjectById<Resource>(id)!;
		if (CreepLib.checkPickup(creep, resource) === C.OK) {
			const amount = Math.min(creep.store.getFreeCapacity(resource.resourceType), resource.amount);
			StoreIntent.add(creep.store, resource.resourceType, amount);
			resource.amount -= amount;
		}
	}),

	registerIntentProcessor(Creep, 'suicide', creep => {
		if (creep.my) {
			Room.removeObject(creep);
		}
	}),

	registerIntentProcessor(Creep, 'transfer', (creep, id: string, resourceType: ResourceType, amount?: number) => {
		const target = Game.getObjectById<RoomObjectWithStore>(id)!;
		if (CreepLib.checkTransfer(creep, target, resourceType, amount) === C.OK) {
			const transferAmount = Math.min(creep.store[resourceType]!, target.store.getFreeCapacity(resourceType));
			StoreIntent.subtract(creep.store, resourceType, transferAmount);
			StoreIntent.add(target.store, resourceType, transferAmount);
		}
	}),

	registerIntentProcessor(Creep, 'upgradeController', (creep, id: string) => {
		const target = Game.getObjectById<StructureController>(id)!;
		if (CreepLib.checkUpgradeController(creep, target) === C.OK) {
			const power = calculatePower(creep, C.WORK, C.UPGRADE_CONTROLLER_POWER);
			const energy = Math.min(power, creep.store.energy);
			StoreIntent.subtract(creep.store, 'energy', energy);
			StructureControllerIntent.upgrade(target, energy);
		}
	}),

	registerIntentProcessor(Creep, 'withdraw', (creep, id: string, resourceType: ResourceType, amount?: number) => {
		const target = Game.getObjectById<Extract<RoomObjectWithStore, Structure>>(id)!;
		if (CreepLib.checkWithdraw(creep, target, resourceType, amount) === C.OK) {
			const transferAmount = Math.min(creep.store.getFreeCapacity(resourceType), target.store[resourceType]!);
			StoreIntent.subtract(target.store, resourceType, transferAmount);
			StoreIntent.add(creep.store, resourceType, transferAmount);
		}
	}),
];

registerTickProcessor(Creep, creep => {
	// Check creep age death
	if (Game.time >= creep._ageTime && creep._ageTime !== 0) {
		for (const [ resourceType, amount ] of Object.entries(creep.store) as [ ResourceType, number ][]) {
			ResourceIntent.drop(creep.pos, resourceType, amount);
		}
		Room.removeObject(creep);
		return true;
	}

	// Dispatch movements
	const nextPosition = Movement.get(creep);
	if (nextPosition) {
		// Move the creep
		Room.moveObject(creep, nextPosition);
		// Calculate base fatigue from plain/road/swamp
		const fatigue = (() => {
			const road = firstMatching(
				creep.room.lookForAt(C.LOOK_STRUCTURES, nextPosition),
				(look): look is Room.LookForType<StructureRoad> => look.structure.structureType === 'road');
			if (road) {
				// Update road decay
				road.structure._nextDecayTime -= C.ROAD_WEAROUT * creep.body.length;
				return 1;
			}
			const terrain = creep.room.getTerrain().get(nextPosition.x, nextPosition.y);
			if (terrain === C.TERRAIN_MASK_SWAMP) {
				return 10;
			} else {
				return 2;
			}
		})();
		// Update fatigue
		creep.fatigue = Math.max(0,
			calculateWeight(creep) * fatigue - calculatePower(creep, C.MOVE, 2));

	} else if (creep.fatigue > 0) {
		// Reduce fatigue
		creep.fatigue -= Math.min(creep.fatigue, calculatePower(creep, C.MOVE, 2));
	}
	return false;
});

export function calculatePower(creep: Creep, part: PartType, power: number) {
	return accumulate(creep.body, bodyPart => {
		if (bodyPart.type === part && bodyPart.hits > 0) {
			return power;
		}
		return 0;
	});
}
