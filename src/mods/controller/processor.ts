import * as C from 'xxscreeps/game/constants';
import * as Store from 'xxscreeps/mods/resource/processor/store';
import { Game } from 'xxscreeps/game';
import { Creep } from 'xxscreeps/mods/creep/creep';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/engine/processor';
import { calculatePower } from 'xxscreeps/mods/creep/processor';
import { StructureController } from './controller';
import { checkSignController, checkUpgradeController } from './creep';
import { saveAction } from 'xxscreeps/game/action-log';

// Processor methods
export function claim(controller: StructureController, user: string) {
	// Take controller
	controller['#user'] = user;
	controller.room['#level'] = 1;
	controller.room['#user'] = user;
}

// Register intent processors
declare module 'xxscreeps/engine/processor' {
	interface Intent { controller: typeof intents }
}
const intents = [
	registerIntentProcessor(Creep, 'signController', (creep, context, id: string, message: string) => {
		const target = Game.getObjectById<StructureController>(id)!;
		if (checkSignController(creep, target) === C.OK) {
			target['#sign'] = message === '' ? undefined : {
				datetime: Date.now(),
				text: message.substr(0, 100),
				time: Game.time,
				userId: creep['#user'],
			};
			context.didUpdate();
		}
	}),

	registerIntentProcessor(Creep, 'upgradeController', (creep, context, id: string) => {
		const controller = Game.getObjectById<StructureController>(id)!;
		if (checkUpgradeController(creep, controller) === C.OK) {
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
					controller['#downgradeTime'] = Game.time + C.CONTROLLER_DOWNGRADE[controller.level]! / 2 + 1;
					++controller.safeModeAvailable;
				}
			}
			saveAction(creep, 'upgradeController', controller.pos.x, controller.pos.y);
			context.didUpdate();
		}
	}),
];

registerObjectTickProcessor(StructureController, (controller, context) => {
	if (controller.level === 0) {
		return;
	}
	const upgradePower = controller['#upgradePowerThisTick'] ?? 0;
	controller['#upgradePowerThisTick'] = 0;
	if (controller['#downgradeTime'] === 0) {
		controller['#downgradeTime'] = Game.time + C.CONTROLLER_DOWNGRADE[controller.level]! + 1;
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
		} else {
			controller['#downgradeTime'] = Game.time + C.CONTROLLER_DOWNGRADE[controller.level]! / 2 + 1;
			controller['#progress'] = Math.round(C.CONTROLLER_LEVELS[controller.level]! * 0.9);
			controller['#safeModeCooldownTime'] = Game.time + C.SAFE_MODE_COOLDOWN;
		}
		context.didUpdate();
	}
	context.wakeAt(controller['#downgradeTime']);
});
