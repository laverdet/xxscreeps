import * as C from 'xxscreeps/game/constants';
import * as Game from 'xxscreeps/game/game';
import { registerHarvestProcessor } from 'xxscreeps/mods/harvestable/processor';
import { registerTickProcessor } from 'xxscreeps/processor';
import { calculatePower } from 'xxscreeps/engine/processor/intents/creep';
import * as ResourceIntent from 'xxscreeps/engine/processor/intents/resource';
import * as StoreIntent from 'xxscreeps/engine/processor/intents/store';
import { Source } from './source';

registerHarvestProcessor(Source, function(creep) {
	const power = calculatePower(creep, C.WORK, C.HARVEST_POWER);
	const energy = Math.min(this.energy, power);
	const overflow = Math.max(energy - creep.store.getFreeCapacity('energy'), 0);
	StoreIntent.add(creep.store, 'energy', energy - overflow);
	this.energy -= energy;
	if (overflow > 0) {
		ResourceIntent.drop(this.pos, 'energy', overflow);
	}
	return true;
});

registerTickProcessor(Source, function() {
	let result = false;

	// Regenerate energy
	if (this.energy < this.energyCapacity) {
		if (this._nextRegenerationTime === 0) {
			this._nextRegenerationTime = Game.time + C.ENERGY_REGEN_TIME;
			result = true;
		} else if (this.ticksToRegeneration === 0) {
			this.energy = this.energyCapacity;
			this._nextRegenerationTime = 0;
			result = true;
		}
	}

	// Update energy capacity on room controller statu
	const energyCapacity = (() => {
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
	result = result || this.energyCapacity !== energyCapacity;
	this.energyCapacity = energyCapacity;

	return result;
});
