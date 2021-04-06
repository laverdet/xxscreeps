import { bindRenderer, bindTerrainRenderer } from 'xxscreeps/backend';
import { Source } from './source';

bindTerrainRenderer(Source, () => 0x5af3ff);

bindRenderer(Source, (source, next) => ({
	...next(),
	energy: source.energy,
	energyCapacity: source.energyCapacity,
	nextRegenerationTime: source._nextRegenerationTime,
}));
