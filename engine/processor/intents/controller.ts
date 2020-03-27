import * as C from '~/game/constants';
import { DowngradeTime, Progress, StructureController, UpgradePowerThisTick } from '~/game/objects/structures/controller';
import { bindProcessor } from '~/engine/processor/bind';

export function upgrade(controller: StructureController, energy: number) {

	controller[Progress] += energy;
	controller[UpgradePowerThisTick] = (controller[UpgradePowerThisTick] ?? 0) + energy;

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

export default () => bindProcessor(StructureController, {
	process() {
		if (this[UpgradePowerThisTick] !== undefined) {
			this[DowngradeTime] = 1 + Math.min(
				this[DowngradeTime] + C.CONTROLLER_DOWNGRADE_RESTORE,
				Game.time + C.CONTROLLER_DOWNGRADE[this.level]!,
			);
			delete this[UpgradePowerThisTick];
		}

		return true;
	},
});
