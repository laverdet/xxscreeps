import { bindMapRenderer, bindRenderer, bindTerrainRenderer, hooks } from 'xxscreeps/backend/index.js';
import { instanceOfPredicate } from 'xxscreeps/functional/predicate.js';
import { StructureExtractor } from './extractor.js';
import { Mineral } from './mineral.js';

bindMapRenderer(Mineral, () => 'm');
bindTerrainRenderer(Mineral, () => 0xaeaeae);

// The world map only shows mineral info on its own layer; every other map-stats request skips it
hooks.register('mapStats', (context, { statName, rooms }) => {
	if (statName === 'minerals0') {
		for (const { room, stats } of rooms) {
			const mineral = room['#objects'].find(instanceOfPredicate(Mineral));
			if (mineral) {
				stats.minerals0 = { type: mineral.mineralType, density: mineral.density };
			}
		}
	}
});

bindRenderer(Mineral, (mineral, next) => ({
	...next(),
	density: mineral.density,
	mineralAmount: mineral.mineralAmount,
	mineralType: mineral.mineralType,
	ticksToRegeneration: 0,
	nextRegenerationTime: mineral['#nextRegenerationTime'],
}));

bindRenderer(StructureExtractor, (extractor, next) => ({
	...next(),
	cooldown: extractor.cooldown,
}));
