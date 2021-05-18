import { bindMapRenderer, bindRenderer } from 'xxscreeps/backend';
import { Structure } from './structure';

bindMapRenderer(Structure, structure => structure['#user'] ?? undefined);

bindRenderer(Structure, (structure, next) => ({
	...next(),
	structureType: structure.structureType,
	hits: structure.hits,
	hitsMax: structure.hitsMax,
	user: structure['#user'],
}));
