import type { Direction } from 'xxscreeps/game/position';
import type { PartType } from 'xxscreeps/mods/creep/creep';
import type { Resource } from 'xxscreeps/mods/resource/resource';
import type { ResourceType, WithStore } from 'xxscreeps/mods/resource/store';
import type { RoomObject } from 'xxscreeps/game/object';
import type { Structure } from 'xxscreeps/mods/structure/structure';
import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import { Game } from 'xxscreeps/game';
import { Creep } from 'xxscreeps/mods/creep/creep';
// eslint-disable-next-line @typescript-eslint/no-duplicate-imports
import * as CreepLib from 'xxscreeps/mods/creep/creep';
import { RoomPosition, generateRoomName, parseRoomName } from 'xxscreeps/game/position';
import { lookForStructureAt } from 'xxscreeps/mods/structure/structure';
import { isBorder } from 'xxscreeps/game/terrain';
import { writeRoomObject } from 'xxscreeps/engine/room';
import { typedArrayToString } from 'xxscreeps/utility/string';
import { registerIntentProcessor, registerObjectPreTickProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor';
import * as Movement from 'xxscreeps/engine/processor/movement';
// eslint-disable-next-line no-duplicate-imports
import * as ResourceIntent from 'xxscreeps/mods/resource/processor/resource';
import * as StoreIntent from 'xxscreeps/mods/resource/processor/store';

declare module 'xxscreeps/engine/processor' {
	interface Intent { creep: typeof intents }
}
const intents = [
	registerIntentProcessor(Creep, 'drop', (creep, context, resourceType: ResourceType, amount: number) => {
		if (CreepLib.checkDrop(creep, resourceType, amount) === C.OK) {
			StoreIntent.subtract(creep.store, resourceType, amount);
			ResourceIntent.drop(creep.pos, resourceType, amount);
			context.didUpdate();
		}
	}),

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

	registerIntentProcessor(Creep, 'say', (creep, context, message: string, isPublic: boolean) => {
		if (CreepLib.checkCommon(creep) === C.OK) {
			creep['#saying'] = {
				isPublic,
				message: `${message}`.substr(0, 10),
			};
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'suicide', (creep, context) => {
		if (creep.my) {
			creep.room['#removeObject'](creep);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'transfer', (creep, context, id: string, resourceType: ResourceType, amount: number) => {
		const target = Game.getObjectById<RoomObject & WithStore>(id)!;
		if (CreepLib.checkTransfer(creep, target, resourceType, amount) === C.OK) {
			StoreIntent.subtract(creep.store, resourceType, amount);
			StoreIntent.add(target.store, resourceType, amount);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'withdraw', (creep, context, id: string, resourceType: ResourceType, amount: number) => {
		const target = Game.getObjectById<Structure & WithStore>(id)!;
		if (CreepLib.checkWithdraw(creep, target, resourceType, amount) === C.OK) {
			StoreIntent.subtract(target.store, resourceType, amount);
			StoreIntent.add(creep.store, resourceType, amount);
			context.didUpdate();
		}
	}),
];

registerObjectPreTickProcessor(Creep, (creep, context) => {
	if (creep['#actionLog'].length !== 0) {
		creep['#actionLog'] = [];
		context.didUpdate();
	}
});

registerObjectTickProcessor(Creep, (creep, context) => {
	// Remove `saying`
	creep['#saying'] = undefined;

	// Check creep death
	if (
		(Game.time >= creep['#ageTime'] && creep['#ageTime'] !== 0) ||
		creep.hits <= 0
	) {
		for (const [ resourceType, amount ] of creep.store['#entries']()) {
			ResourceIntent.drop(creep.pos, resourceType, amount);
		}
		creep.room['#removeObject'](creep);
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
		creep.room['#moveObject'](creep, nextPosition);
		// Calculate base fatigue from plain/road/swamp
		const fatigue = (() => {
			const road = lookForStructureAt(creep.room, nextPosition, C.STRUCTURE_ROAD);
			if (road) {
				// Update road decay
				road['#nextDecayTime'] -= C.ROAD_WEAROUT * creep.body.length;
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
		context.didUpdate();
	}

	if (creep.fatigue > 0) {
		// Reduce fatigue
		creep.fatigue -= Math.min(creep.fatigue, calculatePower(creep, C.MOVE, 2));
		context.didUpdate();
	}

	// Move creep to next room
	if (isBorder(creep.pos.x, creep.pos.y) && creep['#user'].length > 2) {
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
		creep.room['#removeObject'](creep);
		// Update `creep.pos` for the import command but set it back so that `#flushObjects` can safely
		// update the internal indices.
		const oldPos = creep.pos;
		creep.pos = next;
		const importPayload = writeRoomObject(creep);
		creep.pos = oldPos;
		context.sendRoomIntent(next.roomName, 'import', typedArrayToString(importPayload));
		context.didUpdate();
	} else {
		context.wakeAt(creep['#ageTime']);
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
		part.type === C.CARRY || part.type === C.MOVE ? 0 : 1);
	weight += Math.ceil(creep.carry.getUsedCapacity() / C.CARRY_CAPACITY);
	return weight;
}
