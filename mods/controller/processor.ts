import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game';
import { Owner } from 'xxscreeps/game/object';
import { registerObjectTickProcessor } from 'xxscreeps/processor';
import { exchange } from 'xxscreeps/utility/utility';
import { DowngradeTime, Progress, StructureController } from './controller';

export function claim(controller: StructureController, user: string) {
	// Take controller
	controller[Owner] = user;
	controller[DowngradeTime] = 0;
	controller[Progress] = 0;
	controller.safeMode = Game.time + C.SAFE_MODE_DURATION;
	controller.level = 1;
}

export function upgrade(controller: StructureController, energy: number) {

	controller[Progress] += energy;
	controller._upgradePowerThisTick = (controller._upgradePowerThisTick ?? 0) + energy;

	if (controller.level < 8) {
		const nextLevel = C.CONTROLLER_LEVELS[controller.level]!;
		if (controller[Progress] >= nextLevel) {
			++controller.level;
			if (controller.level === 8) {
				controller[Progress] = 0;
			} else {
				controller[Progress] -= nextLevel;
			}
			controller[DowngradeTime] = Game.time + C.CONTROLLER_DOWNGRADE[controller.level]!;
			++controller.safeModeAvailable;
		}
	}
}

registerObjectTickProcessor(StructureController, controller => {
	const upgradePower = exchange(controller, '_upgradePowerThisTick');
	if (upgradePower !== undefined) {
		controller[DowngradeTime] = 1 + Math.min(
			controller[DowngradeTime] + C.CONTROLLER_DOWNGRADE_RESTORE,
			Game.time + C.CONTROLLER_DOWNGRADE[controller.level]!);
		return true;
	}
});
