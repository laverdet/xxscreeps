import * as C from 'xxscreeps/game/constants';
import * as Fn from 'xxscreeps/utility/functional';
import * as Resource from 'xxscreeps/mods/resource/processor/resource';
import * as Store from 'xxscreeps/mods/resource/processor/store';
import { Game } from 'xxscreeps/game';
import { registerHarvestProcessor } from 'xxscreeps/mods/harvestable/processor';
import { registerObjectTickProcessor } from 'xxscreeps/processor';
import { calculatePower } from 'xxscreeps/mods/creep/processor';
import { lookForStructureAt } from 'xxscreeps/mods/structure/structure';
import { CooldownTime } from './extractor';
import { Mineral, NextRegenerationTime } from './mineral';

registerHarvestProcessor(Mineral, (creep, mineral) => {
	const power = calculatePower(creep, C.WORK, C.HARVEST_MINERAL_POWER);
	const amount = Math.min(mineral.mineralAmount, power);
	const overflow = Math.max(amount - creep.store.getFreeCapacity(mineral.mineralType), 0);
	Store.add(creep.store, mineral.mineralType, amount - overflow);
	mineral.mineralAmount -= amount;
	if (overflow > 0) {
		Resource.drop(creep.pos, mineral.mineralType, overflow);
	}
	const extractor = lookForStructureAt(mineral.room, mineral.pos, C.STRUCTURE_EXTRACTOR)!;
	extractor[CooldownTime] = Game.time + C.EXTRACTOR_COOLDOWN;
	return amount;
});

registerObjectTickProcessor(Mineral, (mineral, context) => {

	// Regenerate mineral
	if (mineral.mineralAmount === 0) {
		if (mineral.ticksToRegeneration === undefined) {
			mineral[NextRegenerationTime] = Game.time + C.MINERAL_REGEN_TIME;
			context.didUpdate();
		} else if (mineral.ticksToRegeneration === 0) {
			mineral[NextRegenerationTime] = 0;
			mineral.mineralAmount = C.MINERAL_DENSITY[mineral.density] ?? 0;
			if (
				mineral.density === C.DENSITY_LOW ||
				mineral.density == C.DENSITY_ULTRA ||
				Math.random() < C.MINERAL_DENSITY_CHANGE
			) {
				// Unaccumulate probability from constants
				const probabilities = C.MINERAL_DENSITY_PROBABILITY.map((value, index) =>
					(value ?? 0) - (C.MINERAL_DENSITY_PROBABILITY[index - 1] ?? 0));
				// Drop current density from probabilities
				const adjusted = probabilities.map((value, density) => density === mineral.density ? 0 : value);
				// Reaccumulate probabilities
				const accumulated = [ ...Fn.scan(adjusted, 0, (result, value) => result + value) ];
				// Update density
				const random = Math.random() * accumulated[accumulated.length - 1];
				mineral.density = accumulated.findIndex(value => random <= value);
			}
			context.didUpdate();
		} else {
			context.wakeAt(mineral[NextRegenerationTime]);
		}
	}
});
