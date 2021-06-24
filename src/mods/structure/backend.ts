import { bindMapRenderer, bindRenderer } from 'xxscreeps/backend';
import { Structure } from './structure';
import { Ruin } from './ruin';

bindMapRenderer(Structure, structure => structure['#user'] ?? undefined);

bindRenderer(Structure, (structure, next) => ({
	...next(),
	structureType: structure.structureType,
	hits: structure.hits,
	hitsMax: structure.hitsMax,
	user: structure['#user'],
}));

bindRenderer(Ruin, (ruin, next) => ({
	...next(),
	decayTime: ruin['#decayTime'],
	destroyTime: ruin.destroyTime,
	structure: {
		type: ruin['#structure'].type,
	},
	user: ruin['#user'],
}));
