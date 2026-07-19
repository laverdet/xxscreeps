import type { ProcessorContext } from 'xxscreeps/engine/processor/room.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import * as User from 'xxscreeps/engine/db/user/index.js';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor/index.js';
import * as C from 'xxscreeps/game/constants/index.js';
import { Game } from 'xxscreeps/game/index.js';
import { saveAction } from 'xxscreeps/game/object.js';
import { appendEventLog } from 'xxscreeps/game/room/event-log.js';
import { Creep, calculateBoundedEffect } from 'xxscreeps/mods/classic/creep/creep.js';
import { checkActiveStructures } from 'xxscreeps/mods/classic/structure/structure.js';
import { upsertNotification } from 'xxscreeps/mods/meta/notifications/model.js';
import { StructureController, checkActivateSafeMode, checkUnclaim } from './controller.js';
import * as CreepLib from './creep.js';
import { controlledRoomsKey, incrementGlobalControlLevel, insertControlledRoom, insertReservedRoom, removeControlledRoom, removeReservedRoom } from './model.js';

const PRE_DOWNGRADE_WARNING_TICKS = 3000;

// Processor methods
export function claim(context: ProcessorContext, controller: StructureController, userId: string) {
	const { room } = controller;
	context.task(insertControlledRoom(context.shard, userId, room.name));
	controller['#reservationEndTime'] = 0;
	controller['#user'] = userId;
	updateRoomStatus(room, 1, userId);
	context.didUpdate();
}

export function release(context: ProcessorContext, controller: StructureController) {
	const { room } = controller;
	const userId = room['#user'];
	if (userId != null) {
		const remove = controller.level > 0 ? removeControlledRoom : removeReservedRoom;
		context.task(remove(context.shard, userId, controller.room.name));
	}
	controller['#downgradeTime'] = 0;
	controller['#progress'] = 0;
	controller['#reservationEndTime'] = 0;
	controller['#safeModeCooldownTime'] = 0;
	controller['#user'] = null;
	// TODO: Power needs to be moved to the powercreep mod
	controller.isPowerEnabled = false;
	controller.safeModeAvailable = 0;
	room['#safeModeUntil'] = 0;
	updateRoomStatus(room, 0, null);
	context.didUpdate();
}

export function reserve(context: ProcessorContext, controller: StructureController, userId: string, endTime: number) {
	if (controller['#reservationEndTime'] === 0) {
		updateRoomStatus(controller.room, 0, userId);
		context.task(insertReservedRoom(context.shard, userId, controller.room.name));
	}
	controller['#reservationEndTime'] = endTime;
	context.didUpdate();
}

/**
 * Update room owner and/or level, and notify all objects of the change
 */
function updateRoomStatus(room: Room, level: number, userId: string | null | undefined) {
	room['#level'] = level;
	room['#user'] = userId ?? null;
	// `#immediateObjects` avoids `#flushObjects` mid-Tick: that mutates `#objects` while the engine
	// processor's Tick loop is iterating it.
	for (const object of room['#immediateObjects']()) {
		object['#roomStatusDidChange'](level, userId);
	}
	checkActiveStructures(room);
}

// Register intent processors
declare module 'xxscreeps/engine/processor/index.js' {
	interface Intent { controller: typeof intents }
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intents = [
	registerIntentProcessor(Creep, 'attackController', {
		before: [ 'dismantle', 'attack', 'harvest' ],
		type: 'primary',
	}, (creep, context, id: string) => {
		const controller = Game.getObjectById<StructureController>(id)!;
		if (CreepLib.checkAttackController(creep, controller) === C.OK) {
			const effect = creep.getActiveBodyparts(C.CLAIM);
			const reservation = controller['#reservationEndTime'];
			if (reservation) {
				controller['#reservationEndTime'] = reservation - effect * C.CONTROLLER_RESERVE;
			} else {
				controller['#downgradeTime'] -= effect * C.CONTROLLER_CLAIM_DOWNGRADE;
				controller['#upgradeBlockedUntil'] = Game.time + C.CONTROLLER_ATTACK_BLOCKED_UPGRADE - 1;
			}
			saveAction(creep, 'attack', controller.pos);
			appendEventLog(controller.room, {
				event: C.EVENT_ATTACK_CONTROLLER,
				objectId: creep.id,
			});
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'claimController', { before: 'reserveController' }, (creep, context, id: string) => {
		const controller = Game.getObjectById<StructureController>(id)!;
		if (CreepLib.checkClaimController(creep, controller) === C.OK) {
			const userId = creep['#user'];
			const roomName = controller.room.name;
			// Set user to ensure another user doesn't claim this controller while the promises are
			// pending
			controller['#user'] = userId;
			context.task(async function() {
				// Fetch current GCL & controlled room count from database
				const [ roomCount, gcl ] = await Promise.all([
					context.shard.scratch.sCard(controlledRoomsKey(userId)),
					context.shard.db.data.hGet(User.infoKey(userId), 'gcl'),
				]);
				// Check GCL, and save the newly-controlled room
				const roomCapacity = Math.floor((Number(gcl) / C.GCL_MULTIPLY) ** (1 / C.GCL_POW)) + 1;
				if (roomCapacity > Number(roomCount)) {
					const [ , count ] = await Promise.all([
						insertControlledRoom(context.shard, userId, roomName),
						context.shard.scratch.sCard(controlledRoomsKey(userId)),
					]);
					if (roomCapacity >= count) {
						return true;
					} else {
						await removeControlledRoom(context.shard, userId, roomName);
						return false;
					}
				}
				return false;
			}(), didClaim => {
				if (didClaim) {
					controller['#user'] = null;
					claim(context, controller, creep['#user']);
					saveAction(creep, 'reserveController', controller.pos);
					context.didUpdate();
				}
			});
		}
	}),

	registerIntentProcessor(Creep, 'generateSafeMode', {}, (creep, context, id: string) => {
		const controller = Game.getObjectById<StructureController>(id)!;
		if (CreepLib.checkGenerateSafeMode(creep, controller) === C.OK) {
			creep.store['#subtract'](C.RESOURCE_GHODIUM, C.SAFE_MODE_COST);
			++controller.safeModeAvailable;
			saveAction(creep, 'upgradeController', controller.pos);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'reserveController', {}, (creep, context, id: string) => {
		const controller = Game.getObjectById<StructureController>(id)!;
		if (CreepLib.checkReserveController(creep, controller) === C.OK) {
			const power = creep.getActiveBodyparts(C.CLAIM) * C.CONTROLLER_RESERVE;
			const reservationEndTime = controller['#reservationEndTime'];
			const endTime = reservationEndTime
				? Math.min(Game.time + C.CONTROLLER_RESERVE_MAX, reservationEndTime + power + 1)
				: Game.time + power + 1;
			reserve(context, controller, creep['#user'], endTime);
			saveAction(creep, 'reserveController', controller.pos);
			appendEventLog(controller.room, {
				event: C.EVENT_RESERVE_CONTROLLER,
				objectId: creep.id,
				amount: power,
			});
		}
	}),

	registerIntentProcessor(Creep, 'signController', {}, (creep, context, id: string, message: string | null) => {
		const controller = Game.getObjectById<StructureController>(id)!;
		if (CreepLib.checkSignController(creep, controller, message) === C.OK) {
			controller.room['#sign'] = message ? {
				datetime: Date.now(),
				text: message.substr(0, 100),
				time: Game.time,
				userId: creep['#user'],
			} : undefined;
			saveAction(creep, 'attack', controller.pos);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'upgradeController', { after: 'build' }, (creep, context, id: string) => {
		const controller = Game.getObjectById<StructureController>(id)!;
		if (CreepLib.checkUpgradeController(creep, controller) === C.OK) {
			// Energy cost is driven by unboosted WORK parts (vanilla: `buildEffect`);
			// progress applied is the boosted output. Level-8 CONTROLLER_MAX_UPGRADE_PER_TICK
			// caps the unboosted energy spend, matching vanilla's `target._upgraded`.
			controller.upgradePowerThisTick ??= 0;
			let cap = creep.store.energy;
			if (controller.level === 8) {
				cap = Math.min(cap, C.CONTROLLER_MAX_UPGRADE_PER_TICK - controller.upgradePowerThisTick);
			}
			const { unboosted: energy, boosted: progress } = calculateBoundedEffect(
				creep, C.WORK, C.UPGRADE_CONTROLLER_POWER, 'upgradeController', cap,
			);
			creep.store['#subtract'](C.RESOURCE_ENERGY, energy);

			// Update progress
			controller['#progress'] += progress;
			controller.upgradePowerThisTick += energy;

			if (controller.level < 8) {
				const nextLevel = C.CONTROLLER_LEVELS[controller.level]!;
				if (controller['#progress'] >= nextLevel) {
					const level = ++controller.room['#level'];
					if (controller.level === 8) {
						controller['#progress'] = 0;
					} else {
						controller['#progress'] -= nextLevel;
					}
					controller['#downgradeTime'] = Game.time + C.CONTROLLER_DOWNGRADE[controller.level]! / 2;
					++controller.safeModeAvailable;
					const message = `Your Controller in room ${controller.room.name} has been upgraded to level ${level}.`;
					context.task(upsertNotification(context.shard, controller['#user']!, 'msg', message, 0));
					updateRoomStatus(controller.room, level, controller['#user']);
				}
			}
			saveAction(creep, 'upgradeController', controller.pos);
			// Vanilla emits amount=upgrade output (boosted), energySpent=energy
			// debited from the creep (unboosted).
			appendEventLog(controller.room, {
				event: C.EVENT_UPGRADE_CONTROLLER,
				objectId: creep.id,
				amount: progress,
				energySpent: energy,
			});
			context.didUpdate();
		}
	}),

	registerIntentProcessor(StructureController, 'activateSafeMode', {}, (controller, context) => {
		if (checkActivateSafeMode(controller) === C.OK) {
			--controller.safeModeAvailable;
			controller.room['#safeModeUntil'] = Game.time + C.SAFE_MODE_DURATION - 1;
			controller['#safeModeCooldownTime'] = Game.time + C.SAFE_MODE_COOLDOWN - 1;
			context.didUpdate();
		}
	}),

	registerIntentProcessor(StructureController, 'unclaim', {}, (controller, context) => {
		if (checkUnclaim(controller) === C.OK) {
			release(context, controller);
		}
	}),
];

registerObjectTickProcessor(StructureController, (controller, context) => {
	if (controller.level === 0) {
		const reservationEndTime = controller['#reservationEndTime'];
		if (reservationEndTime) {
			if (reservationEndTime <= Game.time) {
				release(context, controller);
			} else {
				context.wakeAt(reservationEndTime);
			}
		}
	} else {
		const { ticksToDowngrade } = controller;
		const upgradePower = controller.upgradePowerThisTick ?? 0;
		controller.upgradePowerThisTick = 0;
		if (ticksToDowngrade === undefined) {
			controller['#downgradeTime'] = Game.time + C.CONTROLLER_DOWNGRADE[controller.level]!;
			context.didUpdate();
		} else if (upgradePower > 0) {
			controller['#downgradeTime'] = 1 + Math.min(
				controller['#downgradeTime'] + C.CONTROLLER_DOWNGRADE_RESTORE,
				Game.time + C.CONTROLLER_DOWNGRADE[controller.level]!);
			context.task(incrementGlobalControlLevel(context.shard, controller['#user']!, upgradePower));
			context.incrementRoomStat?.(controller['#user'], 'energyControl', upgradePower);
			context.didUpdate();
		} else if (ticksToDowngrade === 0) {
			const { room } = controller;
			const userId = controller['#user']!;
			const level = --room['#level'];
			controller.safeModeAvailable = 0;
			const message = `Your Controller in room ${room.name} has been downgraded to level ${level} due to absence of upgrading activity!`;
			context.task(upsertNotification(context.shard, userId, 'msg', message, 0));
			if (level === 0) {
				release(context, controller);
			} else {
				controller['#downgradeTime'] = Game.time + C.CONTROLLER_DOWNGRADE[level]! / 2;
				controller['#progress'] = Math.round(C.CONTROLLER_LEVELS[level]! * 0.9);
				controller['#safeModeCooldownTime'] = Game.time + C.SAFE_MODE_COOLDOWN - 1;
				updateRoomStatus(controller.room, level, controller['#user']);
			}
			context.didUpdate();
		} else if (ticksToDowngrade === PRE_DOWNGRADE_WARNING_TICKS) {
			const message = `Attention! Your Controller in room ${controller.room.name} will be downgraded to level ${controller.level - 1} in 3000 ticks (~2 hours)! Upgrade it to prevent losing of this room. <a href='http://support.screeps.com/hc/en-us/articles/203086021-Territory-control'>Learn more</a>`;
			context.task(upsertNotification(context.shard, controller['#user']!, 'msg', message, 0));
		}
		context.wakeAt(controller['#downgradeTime']);
	}
});
