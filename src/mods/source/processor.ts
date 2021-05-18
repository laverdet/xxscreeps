import * as C from 'xxscreeps/game/constants';
import * as Resource from 'xxscreeps/mods/resource/processor/resource';
import * as Store from 'xxscreeps/mods/resource/processor/store';
import { Game } from 'xxscreeps/game';
import { registerHarvestProcessor } from 'xxscreeps/mods/harvestable/processor';
import { registerObjectTickProcessor } from 'xxscreeps/engine/processor';
import { calculatePower } from 'xxscreeps/mods/creep/processor';
import { Source } from './source';

registerHarvestProcessor(Source, (creep, source) => {
	const power = calculatePower(creep, C.WORK, C.HARVEST_POWER);
	const energy = Math.min(source.energy, power);
	const overflow = Math.max(energy - creep.store.getFreeCapacity('energy'), 0);
	Store.add(creep.store, 'energy', energy - overflow);
	source.energy -= energy;
	if (overflow > 0) {
		Resource.drop(creep.pos, 'energy', overflow);
	}
	creep.room['#cumulativeEnergyHarvested'] += energy;
	return energy;
});

registerObjectTickProcessor(Source, (source, context) => {

	// Regenerate energy
	if (source.energy < source.energyCapacity) {
		if (source['#nextRegenerationTime'] === 0) {
			source['#nextRegenerationTime'] = Game.time + C.ENERGY_REGEN_TIME;
			context.didUpdate();
		} else if (source.ticksToRegeneration === 0) {
			source.energy = source.energyCapacity;
			source['#nextRegenerationTime'] = 0;
			context.didUpdate();
		}
	} else if (source['#nextRegenerationTime'] !== 0) {
		source['#nextRegenerationTime'] = 0;
	}
	context.wakeAt(source['#nextRegenerationTime']);

	// Update energy capacity on room controller status
	const energyCapacity = (() => {
		const { controller } = source.room;
		if (controller) {
			if (controller.level === 0) {
				return C.SOURCE_ENERGY_NEUTRAL_CAPACITY;
			} else {
				return C.SOURCE_ENERGY_CAPACITY;
			}
		} else {
			return C.SOURCE_ENERGY_KEEPER_CAPACITY;
		}
	})();
	if (source.energyCapacity !== energyCapacity) {
		source.energyCapacity = energyCapacity;
		context.didUpdate();
	}
});
