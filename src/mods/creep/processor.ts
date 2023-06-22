import type { ActionLog, RoomObject } from 'xxscreeps/game/object.js';
import type { Direction } from 'xxscreeps/game/position.js';
import type { ProcessorContext } from 'xxscreeps/engine/processor/room.js';
import type { Resource } from 'xxscreeps/mods/resource/resource.js';
import type { ResourceType } from 'xxscreeps/mods/resource/index.js';
import type { WithStore } from 'xxscreeps/mods/resource/store.js';
import type { Structure } from 'xxscreeps/mods/structure/structure.js';
import C from 'xxscreeps/game/constants/index.js';
import Fn from 'xxscreeps/utility/functional.js';
import * as CreepLib from './creep.js';
import * as Movement from 'xxscreeps/engine/processor/movement.js';
import * as ResourceIntent from 'xxscreeps/mods/resource/processor/resource.js';
import { Game } from 'xxscreeps/game/index.js';
import { Creep, calculateCarry } from './creep.js';
import { RoomPosition, generateRoomName, parseRoomName } from 'xxscreeps/game/position.js';
import { lookForStructureAt } from 'xxscreeps/mods/structure/structure.js';
import { drop as dropResource } from 'xxscreeps/mods/resource/processor/resource.js';
import { isBorder } from 'xxscreeps/game/terrain.js';
import { writeRoomObject } from 'xxscreeps/engine/db/room.js';
import { typedArrayToString } from 'xxscreeps/utility/string.js';
import { hooks, registerIntentProcessor, registerObjectPreTickProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { clamp, filterInPlace } from 'xxscreeps/utility/utility.js';
import { Tombstone, buryCreep } from './tombstone.js';

const pulledToPuller = new Map<Creep, Creep>();
const pullerToPulled = new Map<Creep, Creep>();
hooks.register('flushContext', () => {
	pulledToPuller.clear();
	pullerToPulled.clear();
});

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

function recalculateBody(creep: Creep) {
	// Apply damage to body parts
	let hits = creep.hits - creep.hitsMax;
	for (const part of creep.body) {
		hits += 100;
		part.hits = clamp(0, 100, hits);
	}
	// Drop excess resources
	const capacity = creep.store['#capacity'] = calculateCarry(creep.body);
	let overflow = creep.store.getUsedCapacity() - capacity;
	if (overflow > 0) {
		for (const [ type, amount ] of creep.store['#entries']()) {
			const drop = Math.min(amount, overflow);
			creep.store['#subtract'](type, drop);
			dropResource(creep.pos, type, drop);
			if ((overflow -= drop) <= 0) {
				break;
			}
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

	registerIntentProcessor(Creep, 'move', {}, (creep, context, param: Direction | string) => {
		const target = typeof param === 'string' ? Game.getObjectById<Creep>(param) : param;
		if (CreepLib.checkMove(creep, target) === C.OK) {
			const direction = target instanceof Creep ? creep.pos.getDirectionTo(target.pos) : target!;
			Movement.announce(creep, direction, (commit, look) => {

				// Calculate power & weight
				const { power, weight } = function() {
					const pulled = pullerToPulled.get(creep);
					if (pulled) {
						if (look(pulled)?.isEqualTo(creep.pos)) {
							// Check for cycles
							const seen = new Set<Creep>([ creep ]);
							for (let creep: Creep | undefined = pulled; creep; creep = pullerToPulled.get(creep)) {
								if (seen.has(creep)) {
									pulledToPuller.delete(pullerToPulled.get(creep)!);
									pullerToPulled.delete(creep);
								} else {
									seen.add(creep);
								}
							}
							// A pulling creep has no power; it will actually be pushed by the caboose
							return { power: -Infinity, weight: 0 };
						}
					}
					// Calculate the cumulative power of the chain
					let power = 0;
					let weight = 0;
					let member: Creep | undefined = creep;
					while (true) {
						power += CreepLib.calculatePower(member, C.MOVE, 1);
						weight += CreepLib.calculateWeight(member);
						const puller = pulledToPuller.get(member);
						if (puller) {
							if (look(member)?.isEqualTo(puller.pos)) {
								member = puller;
							} else {
								pulledToPuller.delete(member);
								pullerToPulled.delete(puller);
							}
						} else {
							break;
						}
					}
					return { power, weight };
				}();
				if (power === 0) {
					return;
				}

				// Deduct priority from hostile creeps in safe mode
				const basePriority = weight ? -weight / power : power;
				const priority = basePriority + function() {
					if (
						creep.room.controller?.safeMode === undefined ||
						creep.room.controller['#user'] === creep['#user']
					) {
						return 0;
					} else {
						return -500;
					}
				}();

				// Dispatch movement request
				return commit(priority, pos => {
					// Move resolved successfully
					creep.room['#moveObject'](creep, pos);

					// Calculate base fatigue from plain/road/swamp
					const baseFatigue = (() => {
						const road = lookForStructureAt(creep.room, pos, C.STRUCTURE_ROAD);
						if (road) {
							// Update road decay
							road['#nextDecayTime'] -= C.ROAD_WEAROUT * creep.body.length;
							return 1;
						}
						const terrain = creep.room.getTerrain().get(pos.x, pos.y);
						if (terrain === C.TERRAIN_MASK_SWAMP) {
							return 10;
						} else {
							return 2;
						}
					})();

					// Add adjusted fatigue to first creep in chain
					let receiver = creep;
					for (let creep = pulledToPuller.get(receiver); creep; creep = pulledToPuller.get(creep)) {
						receiver = creep;
					}
					receiver.fatigue += Math.max(0, CreepLib.calculateWeight(creep) * baseFatigue);
					context.didUpdate();
				});
			});
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

	registerIntentProcessor(Creep, 'pull', { before: 'move' }, (creep, context, id: string) => {
		const target = Game.getObjectById<Creep>(id);
		if (CreepLib.checkPull(creep, target) === C.OK) {
			pullerToPulled.set(creep, target!);
			pulledToPuller.set(target!, creep);
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
		if (CreepLib.checkCommon(creep) === C.OK) {
			buryCreep(creep, creep['#user'].length > 2 ? undefined : 0);
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
		recalculateBody(creep);
		context.didUpdate();
	}
	if (
		(Game.time >= creep['#ageTime'] && creep['#ageTime'] !== 0) ||
		creep.hits <= 0
	) {
		buryCreep(creep);
		context.didUpdate();
		return;
	} else if (creep.hits > creep.hitsMax) {
		creep.hits = creep.hitsMax;
		context.didUpdate();
	}

	// Reduce fatigue
	const puller = pulledToPuller.get(creep);
	if (creep.fatigue > 0 || puller) {
		// Calculate power, reduce own fatigue
		let power = CreepLib.calculatePower(creep, C.MOVE, 2);
		const delta = Math.min(creep.fatigue, power);
		creep.fatigue -= delta;
		power -= delta;
		// Reduce fatigue of puller chain
		for (let creep = puller; power > 0 && creep; creep = pulledToPuller.get(creep)) {
			const delta = Math.min(creep.fatigue, power);
			creep.fatigue -= delta;
			power -= delta;
		}
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
		// Creeps are revitalized when moving to a new room
		creep.fatigue = 0;
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

registerObjectTickProcessor(Tombstone, (tombstone, context) => {
	if (tombstone.ticksToDecay === 0) {
		for (const [ resourceType, amount ] of tombstone.store['#entries']()) {
			ResourceIntent.drop(tombstone.pos, resourceType, amount);
		}
		tombstone.room['#removeObject'](tombstone);
		context.didUpdate();
	} else {
		context.wakeAt(tombstone['#decayTime']);
	}
});
