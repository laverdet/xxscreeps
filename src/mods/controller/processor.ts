import * as Controller from 'xxscreeps/game/constants';
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
	controller['#downgradeTime'] = 0;
	controller['#progress'] = 0;
	controller.safeMode = Game.time + Controller.SAFE_MODE_DURATION;
	controller.level = 1;
}

function upgradeController(controller: StructureController, energy: number) {
	controller['#progress'] += energy;
	controller['#upgradePowerThisTick'] = (controller['#upgradePowerThisTick'] ?? 0) + energy;

	if (controller.level < 8) {
		const nextLevel = Controller.CONTROLLER_LEVELS[controller.level]!;
		if (controller['#progress'] >= nextLevel) {
			++controller.level;
			if (controller.level === 8) {
				controller['#progress'] = 0;
			} else {
				controller['#progress'] -= nextLevel;
			}
			controller['#downgradeTime'] = Game.time + Controller.CONTROLLER_DOWNGRADE[controller.level]!;
			++controller.safeModeAvailable;
		}
	}
}

// Register intent processors
declare module 'xxscreeps/engine/processor' {
	interface Intent { controller: typeof intents }
}
const intents = [
	registerIntentProcessor(Creep, 'signController', (creep, context, id: string, message: string) => {
		const target = Game.getObjectById<StructureController>(id)!;
		if (checkSignController(creep, target) === Controller.OK) {
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
		const target = Game.getObjectById<StructureController>(id)!;
		if (checkUpgradeController(creep, target) === Controller.OK) {
			const power = calculatePower(creep, Controller.WORK, Controller.UPGRADE_CONTROLLER_POWER);
			const energy = Math.min(power, creep.store.energy);
			Store.subtract(creep.store, 'energy', energy);
			upgradeController(target, energy);
			saveAction(creep, 'upgradeController', target.pos.x, target.pos.y);
			context.didUpdate();
		}
	}),
];

registerObjectTickProcessor(StructureController, (controller/*, context*/) => {
	const upgradePower = controller['#upgradePowerThisTick'];
	controller['#upgradePowerThisTick'] = 0;
	if (upgradePower !== undefined) {
		controller['#downgradeTime'] = 1 + Math.min(
			controller['#downgradeTime'] + Controller.CONTROLLER_DOWNGRADE_RESTORE,
			Game.time + Controller.CONTROLLER_DOWNGRADE[controller.level]!);
	}
	// context.wakeAt(controller['#downgradeTime']);
});
