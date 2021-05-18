import { bindMapRenderer, bindRenderer } from 'xxscreeps/backend';
import { Structure } from './structure';

bindMapRenderer(Structure, structure => structure.owner ?? undefined);

bindRenderer(Structure, (structure, next) => ({
	...next(),
	structureType: structure.structureType,
	hits: structure.hits,
	hitsMax: structure.hitsMax,
	user: structure.owner,
}));
