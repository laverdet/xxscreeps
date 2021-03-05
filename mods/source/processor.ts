import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import { registerHarvestProcessor } from 'xxscreeps/mods/harvestable/processor';
import { registerObjectTickProcessor } from 'xxscreeps/processor';
import { calculatePower } from 'xxscreeps/engine/processor/intents/creep';
import * as ResourceIntent from 'xxscreeps/engine/processor/intents/resource';
import * as StoreIntent from 'xxscreeps/engine/processor/intents/store';
import { Source } from './source';

registerHarvestProcessor(Source, (creep, source) => {
	const power = calculatePower(creep, C.WORK, C.HARVEST_POWER);
	const energy = Math.min(source.energy, power);
	const overflow = Math.max(energy - creep.store.getFreeCapacity('energy'), 0);
	StoreIntent.add(creep.store, 'energy', energy - overflow);
	source.energy -= energy;
	if (overflow > 0) {
		ResourceIntent.drop(source.pos, 'energy', overflow);
	}
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
			if (controller._owner === null) {
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
