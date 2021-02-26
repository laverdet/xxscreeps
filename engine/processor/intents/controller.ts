import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import { StructureController } from 'xxscreeps/game/objects/structures/controller';
import { registerTickProcessor } from 'xxscreeps/processor';
import { exchange } from 'xxscreeps/util/utility';

export function claim(controller: StructureController, user: string) {
	// Take controller
	controller._owner = user;
	controller._downgradeTime = 0;
	controller._progress = 0;
	controller.safeMode = Game.time + C.SAFE_MODE_DURATION;
	controller.level = 1;
}

export function upgrade(controller: StructureController, energy: number) {

	controller._progress += energy;
	controller._upgradePowerThisTick = (controller._upgradePowerThisTick ?? 0) + energy;

	if (controller.level < 8) {
		const nextLevel = C.CONTROLLER_LEVELS[controller.level]!;
		if (controller._progress >= nextLevel) {
			++controller.level;
			if (controller.level === 8) {
				controller._progress = 0;
			} else {
				controller._progress -= nextLevel;
			}
			controller._downgradeTime = Game.time + C.CONTROLLER_DOWNGRADE[controller.level]!;
			++controller.safeModeAvailable;
		}
	}
}

registerTickProcessor(StructureController, controller => {
	const upgradePower = exchange(controller, '_upgradePowerThisTick');
	if (upgradePower !== undefined) {
		controller._downgradeTime = 1 + Math.min(
			controller._downgradeTime + C.CONTROLLER_DOWNGRADE_RESTORE,
			Game.time + C.CONTROLLER_DOWNGRADE[controller.level]!);
		return true;
	}
});
