import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game';
import * as Fn from 'xxscreeps/utility/functional';
import { Creep, PartType } from 'xxscreeps/mods/creep/creep';
// eslint-disable-next-line no-duplicate-imports
import * as CreepLib from 'xxscreeps/mods/creep/creep';
import type { Resource } from 'xxscreeps/mods/resource/resource';
import type { Structure } from 'xxscreeps/mods/structure/structure';
import { NextDecayTime, StructureRoad } from 'xxscreeps/mods/road/road';
import type { Direction } from 'xxscreeps/game/position';
import type { LookForType } from 'xxscreeps/game/room';
import { moveObject, removeObject } from 'xxscreeps/game/room/methods';
import type { ResourceType, RoomObjectWithStore } from 'xxscreeps/mods/resource/store';
import { ActionLog } from 'xxscreeps/game/action-log';
import { registerIntentProcessor, registerObjectPreTickProcessor, registerObjectTickProcessor } from 'xxscreeps/processor';
import * as Movement from 'xxscreeps/processor/movement';
// eslint-disable-next-line no-duplicate-imports
import * as ResourceIntent from 'xxscreeps/mods/resource/processor/resource';
import * as StoreIntent from 'xxscreeps/mods/resource/processor/store';

declare module 'xxscreeps/processor' {
	interface Intent { creep: typeof intents }
}
const intents = [
	registerIntentProcessor(Creep, 'move', (creep, direction: Direction) => {
		if (CreepLib.checkMove(creep, direction) === C.OK) {
			const power = calculateWeight(creep);
			Movement.add(creep, power, direction);
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
			removeObject(creep);
		}
	}),

	registerIntentProcessor(Creep, 'transfer', (creep, id: string, resourceType: ResourceType, amount: number | null) => {
		const target = Game.getObjectById<RoomObjectWithStore>(id)!;
		if (CreepLib.checkTransfer(creep, target, resourceType, amount) === C.OK) {
			const transferAmount = Math.min(creep.store[resourceType]!, target.store.getFreeCapacity(resourceType));
			StoreIntent.subtract(creep.store, resourceType, transferAmount);
			StoreIntent.add(target.store, resourceType, transferAmount);
		}
	}),

	registerIntentProcessor(Creep, 'withdraw', (creep, id: string, resourceType: ResourceType, amount: number | null) => {
		const target = Game.getObjectById<Extract<RoomObjectWithStore, Structure>>(id)!;
		if (CreepLib.checkWithdraw(creep, target, resourceType, amount) === C.OK) {
			const transferAmount = Math.min(creep.store.getFreeCapacity(resourceType), target.store[resourceType]!);
			StoreIntent.subtract(target.store, resourceType, transferAmount);
			StoreIntent.add(creep.store, resourceType, transferAmount);
		}
	}),
];

registerObjectPreTickProcessor(Creep, creep => {
	creep[ActionLog] = [];
});

registerObjectTickProcessor(Creep, creep => {
	// Check creep death
	if (
		(Game.time >= creep._ageTime && creep._ageTime !== 0) ||
		creep.hits <= 0
	) {
		for (const [ resourceType, amount ] of Object.entries(creep.store) as [ ResourceType, number ][]) {
			ResourceIntent.drop(creep.pos, resourceType, amount);
		}
		removeObject(creep);
		return true;
	} else if (creep.hits > creep.hitsMax) {
		creep.hits = creep.hitsMax;
	}

	// Dispatch movements
	const nextPosition = Movement.get(creep);
	if (nextPosition) {
		// Move the creep
		moveObject(creep, nextPosition);
		// Calculate base fatigue from plain/road/swamp
		const fatigue = (() => {
			const road = Fn.firstMatching(
				creep.room.lookForAt(C.LOOK_STRUCTURES, nextPosition),
				(look): look is LookForType<StructureRoad> => look.structure.structureType === 'road');
			if (road) {
				// Update road decay
				road.structure[NextDecayTime] -= C.ROAD_WEAROUT * creep.body.length;
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
	return Fn.accumulate(creep.body, bodyPart => {
		if (bodyPart.type === part && bodyPart.hits > 0) {
			return power;
		}
		return 0;
	});
}

export function calculateWeight(creep: Creep) {
	let weight = Fn.accumulate(creep.body, part =>
		(part.type === C.CARRY || part.type === C.MOVE) ? 0 : 1);
	weight += Math.ceil(creep.carry.getUsedCapacity() / C.CARRY_CAPACITY);
	return weight;
}
