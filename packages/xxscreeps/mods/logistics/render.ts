import { renderActionLog } from 'xxscreeps/backend/sockets/render.js';
import { bindRenderer } from 'xxscreeps/game/render.js';
import { renderStore } from 'xxscreeps/mods/resource/render.js';
import { StructureLink } from './link.js';
import { StructureStorage } from './storage.js';

bindRenderer(StructureLink, (link, next, previousTime) => ({
	...next(),
	...renderStore(link.store),
	...renderActionLog(link['#actionLog'], previousTime),
	cooldown: link.cooldown,
}));

bindRenderer(StructureStorage, (storage, next) => ({
	...next(),
	...renderStore(storage.store),
}));
