import type { ProcessorContext } from 'xxscreeps/engine/processor/room.js';
import type { ActionLog, RoomObject } from 'xxscreeps/game/object.js';
import type { Direction } from 'xxscreeps/game/position.js';
import type { AnyRoomObject } from 'xxscreeps/game/room/room.js';
import type { Resource, ResourceType } from 'xxscreeps/mods/classic/resource/resource.js';
import type { WithStore } from 'xxscreeps/mods/classic/resource/store.js';
import type { Structure } from 'xxscreeps/mods/classic/structure/structure.js';
import { writeRoomObject } from 'xxscreeps/engine/db/room.js';
import { hooks, registerIntentProcessor, registerObjectPreTickProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import * as Movement from 'xxscreeps/engine/processor/movement.js';
import { numericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { createRoomObject } from 'xxscreeps/game/object.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { makeRoomName, parseRoomName } from 'xxscreeps/game/room/name.js';
import { isBorder } from 'xxscreeps/game/terrain.js';
import { drop as dropResource } from 'xxscreeps/mods/classic/resource/processor/resource.js';
import * as ResourceIntent from 'xxscreeps/mods/classic/resource/processor/resource.js';
import { OpenStore } from 'xxscreeps/mods/classic/resource/store.js';
import { lookForStructureAt } from 'xxscreeps/mods/classic/structure/structure.js';
import { typedArrayToString } from 'xxscreeps/utility/string.js';
import { clamp, filterInPlace } from 'xxscreeps/utility/utility.js';
import { Creep, calculateCarry } from './creep.js';
import * as CreepLib from './creep.js';
import { Tombstone } from './tombstone.js';

const pulledToPuller = new Map<Creep, Creep>();
const pullerToPulled = new Map<Creep, Creep>();
hooks.register('flushContext', () => {
	pulledToPuller.clear();
	pullerToPulled.clear();
});
export const kRetainActionsTime = 10;

export function buryCreep(creep: Creep, rate = C.CREEP_CORPSE_RATE) {
	const tombstone = createRoomObject(new Tombstone(), creep.pos);
	tombstone.deathTime = Game.time;
	tombstone.store = new OpenStore();

	if (rate > 0) {
		const lifeTime = creep.body.some(part => part.type === C.CLAIM)
			? C.CREEP_CLAIM_LIFE_TIME : C.CREEP_LIFE_TIME;
		const lifeRate = rate * (creep.ticksToLive ?? 0) / lifeTime;
		let bodyEnergy = 0;
		const bodyBoosts = new Map<ResourceType, number>();
		for (const part of creep.body) {
			if (part.boost !== undefined) {
				bodyBoosts.set(part.boost,
					(bodyBoosts.get(part.boost) ?? 0) + C.LAB_BOOST_MINERAL * lifeRate);
				bodyEnergy += C.LAB_BOOST_ENERGY * lifeRate;
			}
			bodyEnergy += Math.min(C.CREEP_PART_MAX_ENERGY, C.BODYPART_COST[part.type] * lifeRate);
		}
		// Same-tile container absorbs resources before the tombstone, matching vanilla.
		const container = lookForStructureAt(creep.room, creep.pos, C.STRUCTURE_CONTAINER);
		const deposit = (type: ResourceType, amount: number) => {
			if (amount <= 0) return;
			if (container !== undefined && container.hits > 0) {
				const toContainer = Math.min(amount, container.store.getFreeCapacity(type));
				if (toContainer > 0) {
					container.store['#add'](type, toContainer);
					const remaining = amount - toContainer;
					if (remaining > 0) tombstone.store['#add'](type, remaining);
					return;
				}
			}
			tombstone.store['#add'](type, amount);
		};
		deposit(C.RESOURCE_ENERGY, Math.floor(bodyEnergy));
		for (const [ mineral, amount ] of bodyBoosts) deposit(mineral, Math.floor(amount));
		for (const [ type, amount ] of creep.store['#entries']()) deposit(type, amount);
	}

	const saying = creep['#saying'];
	tombstone['#creep'] = {
		body: creep.body.map(bodyPart => bodyPart.type),
		id: creep.id,
		name: creep.name,
		saying: saying?.isPublic && saying.time === Game.time ? saying.message : undefined,
		ticksToLive: creep.ticksToLive!,
		user: creep['#user'],
	};
	tombstone['#decayTime'] = Game.time + creep.body.length * C.TOMBSTONE_DECAY_PER_PART;
	creep.room['#insertObject'](tombstone);
	creep['#destroy']();
}

export function flushActionLog(actionLog: ActionLog, context: ProcessorContext) {
	const timeLimit = Game.time - kRetainActionsTime;

	const length = actionLog.length;
	if (length > 0) {
		filterInPlace(actionLog, action => action.time > timeLimit);
		if (actionLog.length !== length) {
			context.didUpdate();
		}
		if (actionLog.length > 0) {
			const minimum = Fn.minimum(Fn.map(actionLog, action => action.time), numericComparator)!;
			context.wakeAt(minimum + kRetainActionsTime);
		}
	}
}

/**
 * Calculates effective damage for hit settlement after TOUGH boost reduction.
 * Walks body parts front-to-back: boosted TOUGH parts absorb more incoming
 * damage per HP lost (each point of incoming damage costs only `multiplier` HP).
 * Non-TOUGH and unboosted parts take damage at 1:1. Damage left after all live
 * parts are exhausted is still lethal overkill for creep hits.
 */
function calculateEffectiveDamage(creep: Creep, totalDamage: number) {
	let remainingDamage = totalDamage;
	let effectiveDamage = 0;
	for (const part of creep.body) {
		if (remainingDamage <= 0) break;
		if (part.hits <= 0) continue;
		const multiplier = function() {
			if (part.type === C.TOUGH && part.boost !== undefined) {
				return (C.BOOSTS as CreepLib.BoostsLookup)[C.TOUGH]?.[part.boost]?.damage;
			}
		}() ?? 1;
		const rawDamageToPart = Math.min(remainingDamage, part.hits / multiplier);
		remainingDamage -= rawDamageToPart;
		effectiveDamage += rawDamageToPart * multiplier;
	}
	return effectiveDamage + remainingDamage;
}

export function dropOverflowResources(creep: Creep) {
	const capacity = creep.store['#capacity'] = calculateCarry(creep.body);
	if (creep.hits <= 0) return;
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

function recalculateBody(creep: Creep) {
	// Apply damage to body parts
	let hits = creep.hits - creep.hitsMax;
	for (const part of creep.body) {
		hits += 100;
		part.hits = clamp(0, 100, hits);
	}
	dropOverflowResources(creep);
}

//
// Intent processor arms shared with `PowerCreep`
export function processDrop(creep: CreepLib.Carrier, context: ProcessorContext, resourceType: ResourceType, amount: number) {
	if (CreepLib.checkDrop(creep, resourceType, amount) === C.OK) {
		creep.store['#subtract'](resourceType, amount);
		ResourceIntent.drop(creep.pos, resourceType, amount);
		context.didUpdate();
	}
}

export function processPickup(creep: CreepLib.Carrier, context: ProcessorContext, id: string) {
	const resource = Game.getObjectById<Resource>(id)!;
	if (CreepLib.checkPickup(creep, resource) === C.OK) {
		const amount = Math.min(creep.store.getFreeCapacity(resource.resourceType), resource.amount);
		creep.store['#add'](resource.resourceType, amount);
		resource.amount -= amount;
		context.didUpdate();
	}
}

export function processSay(creep: CreepLib.Carrier, context: ProcessorContext, message: string, isPublic: boolean) {
	if (CreepLib.checkCarrier(creep) === C.OK) {
		creep['#saying'] = {
			isPublic,
			message: String(message).substring(0, 10),
			time: Game.time,
		};
		context.didUpdate();
	}
}

export function processTransfer(creep: CreepLib.Carrier, context: ProcessorContext, id: string, resourceType: ResourceType, amount: number) {
	const target = Game.getObjectById<RoomObject & WithStore>(id)!;
	if (CreepLib.checkTransfer(creep, target, resourceType, amount) === C.OK) {
		creep.store['#subtract'](resourceType, amount);
		target.store['#add'](resourceType, amount);
		appendEventLog(creep.room, {
			event: C.EVENT_TRANSFER,
			objectId: creep.id,
			targetId: target.id,
			resourceType,
			amount,
		});
		context.didUpdate();
	}
}

export function processWithdraw(creep: CreepLib.Carrier, context: ProcessorContext, id: string, resourceType: ResourceType, amount: number) {
	const target = Game.getObjectById<Structure & WithStore>(id)!;
	if (CreepLib.checkWithdraw(creep, target, resourceType, amount) === C.OK) {
		target.store['#subtract'](resourceType, amount);
		creep.store['#add'](resourceType, amount);
		appendEventLog(creep.room, {
			event: C.EVENT_TRANSFER,
			objectId: target.id,
			targetId: creep.id,
			resourceType,
			amount,
		});
		context.didUpdate();
	}
}

/** Safe mode suppresses hostile movement priority and construction-site stomping. */
export function isHostileInSafeMode(mover: CreepLib.Carrier) {
	const { controller } = mover.room;
	return controller?.safeMode !== undefined && controller['#user'] !== mover['#user'];
}

/** Complete a resolved move; returns the destination tile's base fatigue. */
export function commitMove(mover: CreepLib.Carrier, pos: RoomPosition, roadWearout: number) {
	mover.room['#moveObject'](mover, pos);
	const baseFatigue = function() {
		const road = lookForStructureAt(mover.room, pos, C.STRUCTURE_ROAD);
		if (road) {
			// Wear-out advances decay but must not slip past `Game.time` — the road's Tick handler throws
			// on overdue `ticksToDecay`.
			road['#nextDecayTime'] = Math.max(Game.time, road['#nextDecayTime'] - roadWearout);
			return 1;
		}
		const terrain = mover.room.getTerrain().get(pos.x, pos.y);
		if (terrain === C.TERRAIN_MASK_SWAMP) {
			return 10;
		} else {
			return 2;
		}
	}();
	if (!isHostileInSafeMode(mover)) {
		for (const object of mover.room['#lookAt'](pos)) {
			if (object['#lookType'] === 'constructionSite' && object['#user'] !== mover['#user']) {
				const { progress } = object;
				if (progress > 1) {
					ResourceIntent.drop(pos, C.RESOURCE_ENERGY, Math.floor(progress / 2));
				}
				mover.room['#removeObject'](object);
				break;
			}
		}
	}
	return baseFatigue;
}

declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { creep: typeof intents }
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intents = [
	registerIntentProcessor(Creep, 'drop', { before: 'transfer' }, processDrop),

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
						power += CreepLib.calculatePower(member, C.MOVE, 1, 'fatigue');
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
				const priority = basePriority + (isHostileInSafeMode(creep) ? -500 : 0);

				// Dispatch movement request
				return commit(priority, pos => {
					const baseFatigue = commitMove(creep, pos, C.ROAD_WEAROUT * creep.body.length);

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

	registerIntentProcessor(Creep, 'pickup', {}, processPickup),

	registerIntentProcessor(Creep, 'pull', { before: 'move' }, (creep, context, id: string) => {
		const target = Game.getObjectById<Creep>(id);
		if (CreepLib.checkPull(creep, target) === C.OK) {
			pullerToPulled.set(creep, target!);
			pulledToPuller.set(target!, creep);
		}
	}),

	registerIntentProcessor(Creep, 'say', {}, processSay),

	registerIntentProcessor(Creep, 'suicide', {}, (creep, context) => {
		if (CreepLib.checkCommon(creep) === C.OK) {
			buryCreep(creep, creep['#user'].length > 2 ? undefined : 0);
			context.setActive();
		}
	}),

	registerIntentProcessor(Creep, 'transfer', { before: 'withdraw' }, processTransfer),

	registerIntentProcessor(Creep, 'withdraw', { before: 'pickup' }, processWithdraw),
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

	// Check creep death — apply TOUGH damage reduction before updating hits
	const rawDamage = creep.tickRawDamage ?? 0;
	const healing = creep.tickHealing ?? 0;
	if (rawDamage > 0 || healing > 0) {
		const effectiveDamage = rawDamage > 0 ? calculateEffectiveDamage(creep, rawDamage) : 0;
		creep.hits += healing - effectiveDamage;
		creep.tickRawDamage = 0;
		creep.tickHealing = 0;
		recalculateBody(creep);
		context.didUpdate();
	}
	if (creep.ticksToLive === 0 || creep.hits <= 0) {
		buryCreep(creep);
		context.setActive();
		return;
	} else if (creep.hits > creep.hitsMax) {
		creep.hits = creep.hitsMax;
		context.didUpdate();
	}

	// Reduce fatigue
	const puller = pulledToPuller.get(creep);
	if (creep.fatigue > 0 || puller) {
		// Calculate power, reduce own fatigue
		let power = CreepLib.calculatePower(creep, C.MOVE, 2, 'fatigue');
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
		teleportCreep(creep, borderExitPosition(creep.pos), context);
	} else {
		context.wakeAt(creep['#ageTime']);
	}
});

/** The mirrored position in the adjacent room for an object standing on a border tile. */
export function borderExitPosition(pos: RoomPosition) {
	const { rx, ry } = parseRoomName(pos.roomName);
	if (pos.x === 0) {
		return new RoomPosition(49, pos.y, makeRoomName(rx - 1, ry));
	} else if (pos.x === 49) {
		return new RoomPosition(0, pos.y, makeRoomName(rx + 1, ry));
	} else if (pos.y === 0) {
		return new RoomPosition(pos.x, 49, makeRoomName(rx, ry - 1));
	} else {
		return new RoomPosition(pos.x, 0, makeRoomName(rx, ry + 1));
	}
}

interface Teleportable extends RoomObject {
	fatigue?: number;
	'#actionLog': ActionLog;
}

// Move a creep to another room. Used by border crossing and by structures that transport creeps
// across rooms (e.g. portals). The creep is removed from its current room and an import-payload
// intent is queued for the destination room.
export function teleportCreep(creep: AnyRoomObject & Teleportable, next: RoomPosition, context: ProcessorContext) {
	if (creep.room === undefined as never) {
		return;
	}
	creep.room['#removeObject'](creep);
	appendEventLog(creep.room, {
		event: C.EVENT_EXIT,
		objectId: creep.id,
		room: next.roomName,
		x: next.x,
		y: next.y,
	});
	// Update `creep.pos` for the import command but set it back so that `#flushObjects` can safely
	// update the internal indices.
	const oldPos = creep.pos;
	creep.pos = next;
	creep.room = undefined as never;
	// Creeps are revitalized when moving to a new room
	if (creep.fatigue !== undefined) {
		creep.fatigue = 0;
	}
	// Reset actionLog since the actions were in the previous room
	creep['#actionLog'] = [];
	const importPayload = writeRoomObject(creep);
	creep.pos = oldPos;
	context.sendRoomIntent(next.roomName, 'import', typedArrayToString(importPayload));
	context.didUpdate();
}

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
