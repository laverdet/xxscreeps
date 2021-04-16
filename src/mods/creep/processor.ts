import type { Resource } from 'xxscreeps/mods/resource/resource';
import type { ResourceType, WithStore } from 'xxscreeps/mods/resource/store';
import type { RoomObject } from 'xxscreeps/game/object';

import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game';
import * as Fn from 'xxscreeps/utility/functional';
import { Creep, PartType } from 'xxscreeps/mods/creep/creep';
// eslint-disable-next-line no-duplicate-imports
import * as CreepLib from 'xxscreeps/mods/creep/creep';
import { Direction, generateRoomName, parseRoomName, RoomPosition } from 'xxscreeps/game/position';
import { NextDecayTime } from 'xxscreeps/mods/road/road';
import { moveObject, removeObject } from 'xxscreeps/game/room/methods';
import { ActionLog } from 'xxscreeps/game/action-log';
import { Structure, lookForStructureAt } from 'xxscreeps/mods/structure/structure';
import { isBorder } from 'xxscreeps/game/terrain';
import { writeRoomObject } from 'xxscreeps/engine/room';
import { typedArrayToString } from 'xxscreeps/utility/string';
import { registerIntentProcessor, registerObjectPreTickProcessor, registerObjectTickProcessor } from 'xxscreeps/processor';
import * as Movement from 'xxscreeps/processor/movement';
// eslint-disable-next-line no-duplicate-imports
import * as ResourceIntent from 'xxscreeps/mods/resource/processor/resource';
import * as StoreIntent from 'xxscreeps/mods/resource/processor/store';

declare module 'xxscreeps/processor' {
	interface Intent { creep: typeof intents }
}
const intents = [
	registerIntentProcessor(Creep, 'move', (creep, context, direction: Direction) => {
		if (CreepLib.checkMove(creep, direction) === C.OK) {
			const power = calculateWeight(creep);
			Movement.add(creep, power, direction);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'pickup', (creep, context, id: string) => {
		const resource = Game.getObjectById<Resource>(id)!;
		if (CreepLib.checkPickup(creep, resource) === C.OK) {
			const amount = Math.min(creep.store.getFreeCapacity(resource.resourceType), resource.amount);
			StoreIntent.add(creep.store, resource.resourceType, amount);
			resource.amount -= amount;
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'suicide', (creep, context) => {
		if (creep.my) {
			removeObject(creep);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'transfer', (creep, context, id: string, resourceType: ResourceType, amount: number | null) => {
		const target = Game.getObjectById<RoomObject & WithStore>(id)!;
		if (CreepLib.checkTransfer(creep, target, resourceType, amount) === C.OK) {
			const transferAmount = Math.min(creep.store[resourceType]!, target.store.getFreeCapacity(resourceType));
			StoreIntent.subtract(creep.store, resourceType, transferAmount);
			StoreIntent.add(target.store, resourceType, transferAmount);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'withdraw', (creep, context, id: string, resourceType: ResourceType, amount: number | null) => {
		const target = Game.getObjectById<Structure & WithStore>(id)!;
		if (CreepLib.checkWithdraw(creep, target, resourceType, amount) === C.OK) {
			const transferAmount = Math.min(creep.store.getFreeCapacity(resourceType), target.store[resourceType]!);
			StoreIntent.subtract(target.store, resourceType, transferAmount);
			StoreIntent.add(creep.store, resourceType, transferAmount);
			context.didUpdate();
		}
	}),
];

registerObjectPreTickProcessor(Creep, (creep, context) => {
	if (creep[ActionLog].length !== 0) {
		creep[ActionLog] = [];
		context.didUpdate();
	}
});

registerObjectTickProcessor(Creep, (creep, context) => {
	// Check creep death
	if (
		(Game.time >= creep._ageTime && creep._ageTime !== 0) ||
		creep.hits <= 0
	) {
		for (const [ resourceType, amount ] of Object.entries(creep.store) as [ ResourceType, number ][]) {
			ResourceIntent.drop(creep.pos, resourceType, amount);
		}
		removeObject(creep);
		context.didUpdate();
		return;
	} else if (creep.hits > creep.hitsMax) {
		creep.hits = creep.hitsMax;
		context.didUpdate();
	}

	// Dispatch movements
	const nextPosition = Movement.get(creep);
	if (nextPosition) {
		// Move the creep
		moveObject(creep, nextPosition);
		// Calculate base fatigue from plain/road/swamp
		const fatigue = (() => {
			const road = lookForStructureAt(creep.room, nextPosition, C.STRUCTURE_ROAD);
			if (road) {
				// Update road decay
				road[NextDecayTime] -= C.ROAD_WEAROUT * creep.body.length;
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
		creep.fatigue = Math.max(0, calculateWeight(creep) * fatigue);
		context.setActive();
	}

	if (creep.fatigue > 0) {
		// Reduce fatigue
		creep.fatigue -= Math.min(creep.fatigue, calculatePower(creep, C.MOVE, 2));
		context.setActive();
	}

	// Move creep to next room
	if (isBorder(creep.pos.x, creep.pos.y) && creep.owner.length > 2) {
		const { rx, ry } = parseRoomName(creep.pos.roomName);
		const next = function() {
			if (creep.pos.x === 0) {
				return new RoomPosition(49, creep.pos.y, generateRoomName(rx - 1, ry));
			} else if (creep.pos.x === 49) {
				return new RoomPosition(0, creep.pos.y, generateRoomName(rx + 1, ry));
			} else if (creep.pos.y === 0) {
				return new RoomPosition(creep.pos.x, 49, generateRoomName(rx, ry - 1));
			} else {
				return new RoomPosition(creep.pos.x, 0, generateRoomName(rx, ry + 1));
			}
		}();
		removeObject(creep);
		creep.pos = next;
		context.sendRoomIntent(next.roomName, 'import', typedArrayToString(writeRoomObject(creep)));
	}
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
