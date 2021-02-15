import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import type { Shape } from 'xxscreeps/engine/schema/controller';
import { withOverlay } from 'xxscreeps/schema';
import { Structure } from '.';

export class StructureController extends withOverlay<Shape>()(Structure) {
	get progress() { return this.level > 0 ? this._progress : undefined }
	get progressTotal() { return this.level > 0 && this.level < 8 ? C.CONTROLLER_LEVELS[this.level] : undefined }
	get structureType() { return C.STRUCTURE_CONTROLLER }
	get ticksToDowngrade() { return this._downgradeTime === 0 ? undefined : this._downgradeTime - Game.time }
	get upgradeBlocked() {
		if (this._upgradeBlockedTime === 0 || this._upgradeBlockedTime > Game.time) {
			return undefined;
		} else {
			return Game.time - this._upgradeBlockedTime;
		}
	}

	_upgradePowerThisTick?: number; // processor
}
