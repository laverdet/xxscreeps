import * as C from '~/game/constants';
import type { shape } from '~/engine/schema/controller';
import { withOverlay } from '~/lib/schema';
import { Structure } from '.';

export const DowngradeTime = Symbol('downgradeTime');
export const Progress = Symbol('progress');
export const UpgradeBlockedTime = Symbol('upgradeBlockedTime');
export const UpgradePowerThisTick = Symbol('UpgradePowerThisTick');

export class StructureController extends withOverlay<typeof shape>()(Structure) {
	get progress() { return this.level > 0 ? this[Progress] : undefined }
	get progressTotal() { return this.level > 0 && this.level < 8 ? C.CONTROLLER_LEVELS[this.level] : undefined }
	get structureType() { return C.STRUCTURE_CONTROLLER }
	get ticksToDowngrade() { return this[DowngradeTime] === 0 ? undefined : this[DowngradeTime] - Game.time }
	get upgradeBlocked() {
		if (this[UpgradeBlockedTime] === 0 || this[UpgradeBlockedTime] > Game.time) {
			return undefined;
		} else {
			return Game.time - this[UpgradeBlockedTime];
		}
	}

	[UpgradePowerThisTick]?: number; // used by processor only. not saved in schema.
}
