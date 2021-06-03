import * as C from 'xxscreeps/game/constants';
import * as CreepLib from './creep';
import * as Store from 'xxscreeps/mods/resource/processor/store';
import { Game } from 'xxscreeps/game';
import { saveAction } from 'xxscreeps/game/object';
import { Creep } from 'xxscreeps/mods/creep/creep';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor';
import { calculatePower } from 'xxscreeps/mods/creep/processor';
import { StructureController, checkActivateSafeMode } from './controller';

// Processor methods
export function claim(controller: StructureController, user: string) {
	// Take controller
	controller['#reservationTime'] = 0;
	controller['#user'] = user;
	controller.room['#level'] = 1;
	controller.room['#user'] = user;
}

// Register intent processors
declare module 'xxscreeps/engine/processor' {
	interface Intent { controller: typeof intents }
}
const intents = [
	registerIntentProcessor(Creep, 'attackController', (creep, context, id: string) => {
		const controller = Game.getObjectById<StructureController>(id)!;
		if (CreepLib.checkAttackController(creep, controller) === C.OK) {
			const effect = creep.getActiveBodyparts(C.CLAIM);
			const reservation = controller['#reservationTime'];
			if (reservation) {
				controller['#reservationTime'] = reservation - effect * C.CONTROLLER_RESERVE;
			} else {
				// TODO FIX THIS
				controller['#downgradeTime'] -= effect * C.CONTROLLER_CLAIM_DOWNGRADE;
				controller['#upgradeBlockedUntil'] = Game.time + C.CONTROLLER_ATTACK_BLOCKED_UPGRADE - 1;
			}
			saveAction(creep, 'attack', controller.pos);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'claimController', (creep, context, id: string) => {
		const controller = Game.getObjectById<StructureController>(id)!;
		if (CreepLib.checkClaimController(creep, controller) === C.OK) {
			console.error('TODO: claimController');
			claim(controller, creep['#user']);
			saveAction(creep, 'reserveController', controller.pos);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'generateSafeMode', (creep, context, id: string) => {
		const controller = Game.getObjectById<StructureController>(id)!;
		if (CreepLib.checkGenerateSafeMode(creep, controller) === C.OK) {
			creep.store[C.RESOURCE_GHODIUM]! -= C.SAFE_MODE_COST;
			++controller.safeModeAvailable;
			saveAction(creep, 'upgradeController', controller.pos);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'reserveController', (creep, context, id: string) => {
		const controller = Game.getObjectById<StructureController>(id)!;
		if (CreepLib.checkReserveController(creep, controller) === C.OK) {
			controller['#reservationTime'] = Math.min(
				Game.time + C.CONTROLLER_RESERVE_MAX - 1,
				(controller['#reservationTime'] || (Game.time - 1)) +
					creep.getActiveBodyparts(C.CLAIM) * C.CONTROLLER_RESERVE);
			controller.room['#user'] = creep['#user'];
			saveAction(creep, 'reserveController', controller.pos);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'signController', (creep, context, id: string, message: string) => {
		const controller = Game.getObjectById<StructureController>(id)!;
		if (CreepLib.checkSignController(creep, controller) === C.OK) {
			controller.room['#sign'] = message === '' ? undefined : {
				datetime: Date.now(),
				text: message.substr(0, 100),
				time: Game.time,
				userId: creep['#user'],
			};
			saveAction(creep, 'attack', controller.pos);
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'upgradeController', (creep, context, id: string) => {
		const controller = Game.getObjectById<StructureController>(id)!;
		if (CreepLib.checkUpgradeController(creep, controller) === C.OK) {
			// Calculate power, deduct energy
			controller['#upgradePowerThisTick'] ??= 0;
			let power = calculatePower(creep, C.WORK, C.UPGRADE_CONTROLLER_POWER);
			if (controller.level === 8) {
				power = Math.min(power, C.CONTROLLER_MAX_UPGRADE_PER_TICK - controller['#upgradePowerThisTick']);
			}
			const energy = Math.min(power, creep.store.energy);
			Store.subtract(creep.store, 'energy', energy);

			// Update progress
			controller['#progress'] += energy;
			controller['#upgradePowerThisTick'] += energy;

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

	registerIntentProcessor(StructureController, 'activateSafeMode', (controller, context) => {
		if (checkActivateSafeMode(controller) === C.OK) {
			--controller.safeModeAvailable;
			controller.room['#safeModeUntil'] = Game.time + C.SAFE_MODE_DURATION - 1;
			controller['#safeModeCooldownTime'] = Game.time + C.SAFE_MODE_COOLDOWN - 1;
			context.didUpdate();
		}
	}),
];

registerObjectTickProcessor(StructureController, (controller, context) => {
	if (controller.level === 0) {
		const reservationTime = controller['#reservationTime'];
		if (reservationTime) {
			if (reservationTime <= Game.time) {
				controller['#reservationTime'] = 0;
				controller.room['#user'] = null;
				context.didUpdate();
			} else {
				context.wakeAt(reservationTime);
			}
		}
	} else {
		const upgradePower = controller['#upgradePowerThisTick'] ?? 0;
		controller['#upgradePowerThisTick'] = 0;
		if (controller['#downgradeTime'] === 0) {
			controller['#downgradeTime'] = Game.time + C.CONTROLLER_DOWNGRADE[controller.level]!;
			context.didUpdate();
		} else if (upgradePower > 0) {
			controller['#downgradeTime'] = 1 + Math.min(
				controller['#downgradeTime'] + C.CONTROLLER_DOWNGRADE_RESTORE,
				Game.time + C.CONTROLLER_DOWNGRADE[controller.level]!);
			context.didUpdate();
		} else if (controller.ticksToDowngrade === 0) {
			--controller.room['#level'];
			controller.safeModeAvailable = 0;
			if (controller.level === 0) {
				controller['#downgradeTime'] = 0;
				controller['#progress'] = 0;
				controller['#user'] = null;
				controller['#safeModeCooldownTime'] = 0;
				controller.room['#safeModeUntil'] = 0;
				controller.room['#user'] = null;
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
