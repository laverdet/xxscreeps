import { bindMapRenderer, bindRenderer, bindTerrainRenderer } from 'xxscreeps/backend/index.js';
import { StructureExtractor } from './extractor.js';
import { Mineral } from './mineral.js';

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
