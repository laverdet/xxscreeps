import { bindMapRenderer, bindRenderer, bindTerrainRenderer } from 'xxscreeps/backend';
import { StructureExtractor } from './extractor';
import { Mineral } from './mineral';

bindMapRenderer(Mineral, () => 'm');
bindTerrainRenderer(Mineral, () => 0xaeaeae);

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
