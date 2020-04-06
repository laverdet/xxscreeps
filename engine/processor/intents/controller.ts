import * as C from '~/game/constants';
import * as Game from '~/game/game';
import { StructureController } from '~/game/objects/structures/controller';
import { bindProcessor } from '~/engine/processor/bind';
import { exchange } from '~/lib/utility';

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

export default () => bindProcessor(StructureController, {
	tick() {
		const upgradePower = exchange(this, '_upgradePowerThisTick');
		if (upgradePower !== undefined) {
			this._downgradeTime = 1 + Math.min(
				this._downgradeTime + C.CONTROLLER_DOWNGRADE_RESTORE,
				Game.time + C.CONTROLLER_DOWNGRADE[this.level]!);
			return true;
		}

		return false;
	},
});
