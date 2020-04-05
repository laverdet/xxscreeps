import * as C from '~/game/constants';
import { bindProcessor } from '~/engine/processor/bind';
import { Source } from '~/game/objects/source';

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
