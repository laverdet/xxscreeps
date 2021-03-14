import * as Controller from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game';
import * as Store from 'xxscreeps/mods/resource/processor/store';
import { Owner } from 'xxscreeps/game/object';
import { Creep } from 'xxscreeps/mods/creep/creep';
import { registerIntentProcessor, registerObjectTickProcessor } from 'xxscreeps/processor';
import { calculatePower } from 'xxscreeps/mods/creep/processor';
import { exchange } from 'xxscreeps/utility/utility';
import { DowngradeTime, Progress, StructureController, UpgradePowerThisTick } from './controller';
import { checkUpgradeController } from './creep';
import { saveAction } from 'xxscreeps/game/action-log';

// Processor methods
export function claim(controller: StructureController, user: string) {
	// Take controller
	controller[Owner] = user;
	controller[DowngradeTime] = 0;
	controller[Progress] = 0;
	controller.safeMode = Game.time + Controller.SAFE_MODE_DURATION;
	controller.level = 1;
}

function upgradeController(controller: StructureController, energy: number) {
	controller[Progress] += energy;
	controller[UpgradePowerThisTick] = (controller[UpgradePowerThisTick] ?? 0) + energy;

	if (controller.level < 8) {
		const nextLevel = Controller.CONTROLLER_LEVELS[controller.level]!;
		if (controller[Progress] >= nextLevel) {
			++controller.level;
			if (controller.level === 8) {
				controller[Progress] = 0;
			} else {
				controller[Progress] -= nextLevel;
			}
			controller[DowngradeTime] = Game.time + Controller.CONTROLLER_DOWNGRADE[controller.level]!;
			++controller.safeModeAvailable;
		}
	}
}

// Register intent processors
declare module 'xxscreeps/processor' {
	interface Intent { controller: typeof intent }
}
const intent = registerIntentProcessor(Creep, 'upgradeController', (creep, id: string) => {
	const target = Game.getObjectById<StructureController>(id)!;
	if (checkUpgradeController(creep, target) === Controller.OK) {
		const power = calculatePower(creep, Controller.WORK, Controller.UPGRADE_CONTROLLER_POWER);
		const energy = Math.min(power, creep.store.energy);
		Store.subtract(creep.store, 'energy', energy);
		upgradeController(target, energy);
		saveAction(creep, 'upgradeController', target.pos.x, target.pos.y);
	}
});

registerObjectTickProcessor(StructureController, controller => {
	const upgradePower = exchange(controller, UpgradePowerThisTick);
	if (upgradePower !== undefined) {
		controller[DowngradeTime] = 1 + Math.min(
			controller[DowngradeTime] + Controller.CONTROLLER_DOWNGRADE_RESTORE,
			Game.time + Controller.CONTROLLER_DOWNGRADE[controller.level]!);
		return true;
	}
});
