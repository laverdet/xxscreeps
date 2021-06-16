import config from 'xxscreeps/config';
import { bindMapRenderer, bindRenderer, bindTerrainRenderer } from 'xxscreeps/backend';
import { StructureExtractor } from './extractor';
import { Mineral } from './mineral';

if (config.backend.socketSkipsPermanents) {
	bindTerrainRenderer(Mineral, () => 0xaeaeae);
} else {
	bindMapRenderer(Mineral, () => 'm');
}

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
