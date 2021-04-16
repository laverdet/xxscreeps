import { bindRenderer, bindTerrainRenderer } from 'xxscreeps/backend';
import { Mineral, NextRegenerationTime } from './mineral';

bindTerrainRenderer(Mineral, () => 0xaeaeae);

bindRenderer(Mineral, (mineral, next) => ({
	...next(),
	mineralAmount: mineral.mineralAmount,
	mineralType: mineral.mineralType,
	ticksToRegeneration: 0,
	nextRegenerationTime: mineral[NextRegenerationTime],
}));
