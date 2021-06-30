import * as C from 'xxscreeps/game/constants';
import * as CreepLib from './creep';
import * as User from 'xxscreeps/engine/db/user';
import { Game } from 'xxscreeps/game';
import { saveAction } from 'xxscreeps/game/object';
import { Creep, calculatePower } from 'xxscreeps/mods/creep/creep';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor';
import { StructureController, checkActivateSafeMode, checkUnclaim } from './controller';

export const controlledRoomKey = (userId: string) => `user/${userId}/controlledRooms`;
export const reservedRoomKey = (userId: string) => `user/${userId}/reservedRooms`;

// Processor methods
export function claim(controller: StructureController, user: string) {
	// Take controller
	controller['#reservationEndTime'] = 0;
	controller['#user'] = user;
	controller.room['#level'] = 1;
	controller.room['#user'] = user;
}

// Register intent processors
declare module 'xxscreeps/engine/processor' {
	interface Intent { controller: typeof intents }
}
const intents = [
	registerIntentProcessor(Creep, 'attackController', {
		before: [ 'dismantle', 'attack', 'harvest' ],
		type: 'primary',
	}, (creep, context, id: string) => {
		const controller = Game.getObjectById<StructureController>(id)!;
		if (CreepLib.checkAttackController(creep, controller) === C.OK) {
			const effect = creep.getActiveBodyparts(C.CLAIM);
			const reservation = controller['#reservationEndTime'];
			controller['#user'] = null;
			if (reservation) {
				controller['#reservationEndTime'] = reservation - effect * C.CONTROLLER_RESERVE;
			} else {
				// TODO FIX THIS
				controller['#downgradeTime'] -= effect * C.CONTROLLER_CLAIM_DOWNGRADE;
				controller['#upgradeBlockedUntil'] = Game.time + C.CONTROLLER_ATTACK_BLOCKED_UPGRADE - 1;
			}
			saveAction(creep, 'attack', controller.pos);
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
					context.shard.scratch.scard(controlledRoomKey(userId)),
					context.shard.db.data.hget(User.infoKey(userId), 'gcl'),
				]);
				// Check GCL, and save the newly-controlled room
				const roomCapacity = Math.floor((Number(gcl) / C.GCL_MULTIPLY) ** (1 / C.GCL_POW)) + 1;
				if (roomCapacity > Number(roomCount)) {
					const [ , count ] = await Promise.all([
						context.shard.scratch.sadd(controlledRoomKey(userId), [ roomName ]),
						context.shard.scratch.scard(controlledRoomKey(userId)),
					]);
					if (roomCapacity >= count) {
						return true;
					} else {
						await context.shard.scratch.srem(controlledRoomKey(userId), [ roomName ]);
						return false;
					}
				}
				return false;
			}(), didClaim => {
				if (didClaim) {
					controller['#user'] = null;
					claim(controller, creep['#user']);
					saveAction(creep, 'reserveController', controller.pos);
					context.didUpdate();
				}
			});
		}
	}),

	registerIntentProcessor(Creep, 'generateSafeMode', {}, (creep, context, id: string) => {
		const controller = Game.getObjectById<StructureController>(id)!;
		if (CreepLib.checkGenerateSafeMode(creep, controller) === C.OK) {
			creep.store[C.RESOURCE_GHODIUM]! -= C.SAFE_MODE_COST;
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
			if (reservationEndTime) {
				controller['#reservationEndTime'] = Math.min(
					Game.time + C.CONTROLLER_RESERVE_MAX,
					reservationEndTime + power + 1,
				);
			} else {
				const userId = creep['#user'];
				controller['#reservationEndTime'] = Game.time + power + 1;
				controller.room['#user'] = userId;
				context.task(context.shard.scratch.sadd(reservedRoomKey(userId), [ controller.room.name ]));
			}
			saveAction(creep, 'reserveController', controller.pos);
			context.didUpdate();
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
			// Calculate power, deduct energy
			controller.upgradePowerThisTick ??= 0;
			let power = calculatePower(creep, C.WORK, C.UPGRADE_CONTROLLER_POWER);
			if (controller.level === 8) {
				power = Math.min(power, C.CONTROLLER_MAX_UPGRADE_PER_TICK - controller.upgradePowerThisTick);
			}
			const energy = Math.min(power, creep.store.energy);
			creep.store['#subtract'](C.RESOURCE_ENERGY, energy);

			// Update progress
			controller['#progress'] += energy;
			controller.upgradePowerThisTick += energy;

			if (controller.level < 8) {
				const nextLevel = C.CONTROLLER_LEVELS[controller.level]!;
				if (controller['#progress'] >= nextLevel) {
					++controller.room['#level'];
					if (controller.level === 8) {
						controller['#progress'] = 0;
					} else {
						controller['#progress'] -= nextLevel;
					}
					controller['#downgradeTime'] = Game.time + C.CONTROLLER_DOWNGRADE[controller.level]! / 2;
					++controller.safeModeAvailable;
				}
			}
			saveAction(creep, 'upgradeController', controller.pos);
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
			controller.isPowerEnabled = false;
			controller.safeModeAvailable = 0;
			controller['#downgradeTime'] = 0;
			controller['#progress'] = 0;
			controller['#safeModeCooldownTime'] = 0;
			controller['#upgradeBlockedUntil'] = 0;
			controller['#user'] =
			controller.room['#user'] = null;
			controller.room['#level'] = 0;
			controller.room['#safeModeUntil'] = 0;
			context.didUpdate();
		}
	}),
];

registerObjectTickProcessor(StructureController, (controller, context) => {
	if (controller.level === 0) {
		const reservationEndTime = controller['#reservationEndTime'];
		if (reservationEndTime) {
			if (reservationEndTime <= Game.time) {
				const userId = controller.room['#user']!;
				controller['#reservationEndTime'] = 0;
				controller.room['#user'] = null;
				context.task(context.shard.scratch.srem(reservedRoomKey(userId), [ controller.room.name ]));
				context.didUpdate();
			} else {
				context.wakeAt(reservationEndTime);
			}
		}
	} else {
		const upgradePower = controller.upgradePowerThisTick ?? 0;
		controller.upgradePowerThisTick = 0;
		if (controller['#downgradeTime'] === 0) {
			controller['#downgradeTime'] = Game.time + C.CONTROLLER_DOWNGRADE[controller.level]!;
			context.didUpdate();
		} else if (upgradePower > 0) {
			controller['#downgradeTime'] = 1 + Math.min(
				controller['#downgradeTime'] + C.CONTROLLER_DOWNGRADE_RESTORE,
				Game.time + C.CONTROLLER_DOWNGRADE[controller.level]!);
			context.task(context.shard.db.data.hincrBy(User.infoKey(controller['#user']!), 'gcl', upgradePower));
			context.didUpdate();
		} else if (controller.ticksToDowngrade === 0) {
			--controller.room['#level'];
			controller.safeModeAvailable = 0;
			if (controller.level === 0) {
				const userId = controller.room['#user']!;
				controller['#downgradeTime'] = 0;
				controller['#progress'] = 0;
				controller['#user'] = null;
				controller['#safeModeCooldownTime'] = 0;
				controller.room['#safeModeUntil'] = 0;
				controller.room['#user'] = null;
				context.task(context.shard.scratch.srem(controlledRoomKey(userId), [ controller.room.name ]));
			} else {
				controller['#downgradeTime'] = Game.time + C.CONTROLLER_DOWNGRADE[controller.level]! / 2;
				controller['#progress'] = Math.round(C.CONTROLLER_LEVELS[controller.level]! * 0.9);
				controller['#safeModeCooldownTime'] = Game.time + C.SAFE_MODE_COOLDOWN - 1;
			}
			context.didUpdate();
		}
		context.wakeAt(controller['#downgradeTime']);
	}
});
