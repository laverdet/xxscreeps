import type { ActionLog, RoomObject } from 'xxscreeps/game/object';
import type { Direction } from 'xxscreeps/game/position';
import type { ProcessorContext } from 'xxscreeps/engine/processor/room';
import type { Resource } from 'xxscreeps/mods/resource/resource';
import type { ResourceType } from 'xxscreeps/mods/resource';
import type { WithStore } from 'xxscreeps/mods/resource/store';
import type { Structure } from 'xxscreeps/mods/structure/structure';
import * as C from 'xxscreeps/game/constants';
import * as CreepLib from 'xxscreeps/mods/creep/creep';
import * as Fn from 'xxscreeps/utility/functional';
import * as Movement from 'xxscreeps/engine/processor/movement';
import * as ResourceIntent from 'xxscreeps/mods/resource/processor/resource';
import { Game } from 'xxscreeps/game';
import { Creep } from 'xxscreeps/mods/creep/creep';
// eslint-disable-next-line @typescript-eslint/no-duplicate-imports
import { RoomPosition, generateRoomName, parseRoomName } from 'xxscreeps/game/position';
import { lookForStructureAt } from 'xxscreeps/mods/structure/structure';
import { isBorder } from 'xxscreeps/game/terrain';
import { writeRoomObject } from 'xxscreeps/engine/db/room';
import { typedArrayToString } from 'xxscreeps/utility/string';
import { registerIntentProcessor, registerObjectPreTickProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor';
import { filterInPlace } from 'xxscreeps/utility/utility';

export function flushActionLog(actionLog: ActionLog, context: ProcessorContext) {
	const kRetainActionsTime = 10;
	const timeLimit = Game.time - kRetainActionsTime;

	const length = actionLog.length;
	if (length > 0) {
		filterInPlace(actionLog, action => action.time > timeLimit);
		if (actionLog.length !== length) {
			context.didUpdate();
		}
		if (actionLog.length > 0) {
			const minimum = Fn.minimum(Fn.map(actionLog, action => action.time))!;
			context.wakeAt(minimum + kRetainActionsTime);
		}
	}
}

declare module 'xxscreeps/engine/processor' {
	interface Intent { creep: typeof intents }
}
const intents = [
	registerIntentProcessor(Creep, 'drop', { before: 'transfer' }, (creep, context, resourceType: ResourceType, amount: number) => {
		if (CreepLib.checkDrop(creep, resourceType, amount) === C.OK) {
			creep.store['#subtract'](resourceType, amount);
			ResourceIntent.drop(creep.pos, resourceType, amount);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'move', {}, (creep, context, direction: Direction) => {
		if (CreepLib.checkMove(creep, direction) === C.OK) {
			const power = CreepLib.calculateWeight(creep);
			Movement.add(creep, power, direction);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'pickup', {}, (creep, context, id: string) => {
		const resource = Game.getObjectById<Resource>(id)!;
		if (CreepLib.checkPickup(creep, resource) === C.OK) {
			const amount = Math.min(creep.store.getFreeCapacity(resource.resourceType), resource.amount);
			creep.store['#add'](resource.resourceType, amount);
			resource.amount -= amount;
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'say', {}, (creep, context, message: string, isPublic: boolean) => {
		if (CreepLib.checkCommon(creep) === C.OK) {
			creep['#saying'] = {
				isPublic,
				message: `${message}`.substr(0, 10),
				time: Game.time,
			};
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'suicide', {}, (creep, context) => {
		if (creep.my) {
			creep.room['#removeObject'](creep);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'transfer', { before: 'withdraw' }, (creep, context, id: string, resourceType: ResourceType, amount: number) => {
		const target = Game.getObjectById<RoomObject & WithStore>(id)!;
		if (CreepLib.checkTransfer(creep, target, resourceType, amount) === C.OK) {
			creep.store['#subtract'](resourceType, amount);
			target.store['#add'](resourceType, amount);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'withdraw', { before: 'pickup' }, (creep, context, id: string, resourceType: ResourceType, amount: number) => {
		const target = Game.getObjectById<Structure & WithStore>(id)!;
		if (CreepLib.checkWithdraw(creep, target, resourceType, amount) === C.OK) {
			target.store['#subtract'](resourceType, amount);
			creep.store['#add'](resourceType, amount);
			context.didUpdate();
		}
	}),
];

registerObjectPreTickProcessor(Creep, (creep, context) => {
	const kRetainActionsTime = 10;
	const timeLimit = Game.time - kRetainActionsTime;
	flushActionLog(creep['#actionLog'], context);

	// Remove `saying`
	const saying = creep['#saying'];
	if (saying) {
		if (saying.time <= timeLimit) {
			creep['#saying'] = undefined;
			context.didUpdate();
		} else {
			context.wakeAt(saying.time + kRetainActionsTime);
		}
	}
});

registerObjectTickProcessor(Creep, (creep, context) => {

	// Check creep death
	if (creep.tickHitsDelta) {
		creep.hits += creep.tickHitsDelta;
		creep.tickHitsDelta = 0;
		context.didUpdate();
	}
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
		creep.fatigue = Math.max(0, CreepLib.calculateWeight(creep) * fatigue);
		context.didUpdate();
	}

	if (creep.fatigue > 0) {
		// Reduce fatigue
		creep.fatigue -= Math.min(creep.fatigue, CreepLib.calculatePower(creep, C.MOVE, 2));
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
		// Reset actionLog since the actions were in the previous room
		creep['#actionLog'] = [];
		const importPayload = writeRoomObject(creep);
		creep.pos = oldPos;
		context.sendRoomIntent(next.roomName, 'import', typedArrayToString(importPayload));
		context.didUpdate();
	} else {
		context.wakeAt(creep['#ageTime']);
	}
});
