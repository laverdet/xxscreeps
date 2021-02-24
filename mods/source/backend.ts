import { bindRenderer, bindMapRenderer } from 'xxscreeps/backend';
import { Source } from './source';

bindMapRenderer(Source, () => 's');

bindRenderer(Source, (source, next) => ({
	...next(),
	energy: source.energy,
	energyCapacity: source.energyCapacity,
	nextRegenerationTime: source._nextRegenerationTime,
}));
