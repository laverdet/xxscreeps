import { bindMapRenderer, bindRenderer } from 'xxscreeps/game/render.js';
import { renderStore } from 'xxscreeps/mods/resource/render.js';
import { Ruin } from './ruin.js';
import { Structure } from './structure.js';

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
	...renderStore(ruin.store),
	decayTime: ruin['#decayTime'],
	destroyTime: ruin.destroyTime,
	structure: {
		type: ruin['#structure'].type,
	},
	user: ruin['#structure'].user,
}));
