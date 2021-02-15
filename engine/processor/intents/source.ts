import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import { Source } from 'xxscreeps/game/objects/source';
import { bindProcessor } from 'xxscreeps/engine/processor/bind';

export default () => bindProcessor(Source, {
	tick() {
		if (this.energy < this.energyCapacity) {
			if (this._nextRegenerationTime === 0) {
				this._nextRegenerationTime = Game.time + C.ENERGY_REGEN_TIME;
			} else if (this.ticksToRegeneration === 0) {
				this.energy = this.energyCapacity;
				this._nextRegenerationTime = 0;
			}
		}

		this.energyCapacity = (() => {
			const { controller } = this.room;
			if (controller) {
				if (controller._owner === undefined) {
					return C.SOURCE_ENERGY_NEUTRAL_CAPACITY;
				} else {
					return C.SOURCE_ENERGY_CAPACITY;
				}
			} else {
				return C.SOURCE_ENERGY_KEEPER_CAPACITY;
			}
		})();

		return true;
	},
});
