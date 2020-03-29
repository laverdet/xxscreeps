import * as C from '~/game/constants';
import { bindProcessor } from '~/engine/processor/bind';
import { Source, NextRegenerationTime } from '~/game/objects/source';
import { Owner } from '~/game/objects/structures';

export default () => bindProcessor(Source, {
	tick() {
		if (this.energy < this.energyCapacity) {
			if (this[NextRegenerationTime] === 0) {
				this[NextRegenerationTime] = Game.time + C.ENERGY_REGEN_TIME;
			} else if (this.ticksToRegeneration === 0) {
				this.energy = this.energyCapacity;
				this[NextRegenerationTime] = 0;
			}
		}

		this.energyCapacity = (() => {
			const { controller } = this.room;
			if (controller) {
				if (controller[Owner] === undefined) {
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
