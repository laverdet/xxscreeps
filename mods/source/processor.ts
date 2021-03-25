import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game';
import * as Resource from 'xxscreeps/mods/resource/processor/resource';
import * as Store from 'xxscreeps/mods/resource/processor/store';
import { registerHarvestProcessor } from 'xxscreeps/mods/harvestable/processor';
import { registerObjectTickProcessor } from 'xxscreeps/processor';
import { calculatePower } from 'xxscreeps/mods/creep/processor';
import { Source } from './source';
import { CumulativeEnergyHarvested } from './symbols';

registerHarvestProcessor(Source, (creep, source) => {
	const power = calculatePower(creep, C.WORK, C.HARVEST_POWER);
	const energy = Math.min(source.energy, power);
	const overflow = Math.max(energy - creep.store.getFreeCapacity('energy'), 0);
	Store.add(creep.store, 'energy', energy - overflow);
	source.energy -= energy;
	if (overflow > 0) {
		Resource.drop(creep.pos, 'energy', overflow);
	}
	creep.room[CumulativeEnergyHarvested] += energy;
	return energy;
});

registerObjectTickProcessor(Source, source => {

	// Regenerate energy
	if (source.energy < source.energyCapacity) {
		if (source._nextRegenerationTime === 0) {
			source._nextRegenerationTime = Game.time + C.ENERGY_REGEN_TIME;
		} else if (source.ticksToRegeneration === 0) {
			source.energy = source.energyCapacity;
			source._nextRegenerationTime = 0;
		}
	}

	// Update energy capacity on room controller status
	const energyCapacity = (() => {
		const { controller } = source.room;
		if (controller) {
			if (controller.owner === null) {
				return C.SOURCE_ENERGY_NEUTRAL_CAPACITY;
			} else {
				return C.SOURCE_ENERGY_CAPACITY;
			}
		} else {
			return C.SOURCE_ENERGY_KEEPER_CAPACITY;
		}
	})();
	source.energyCapacity = energyCapacity;
});
