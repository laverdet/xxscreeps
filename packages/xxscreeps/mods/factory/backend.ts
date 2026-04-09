import { bindRenderer } from 'xxscreeps/backend/index.js';
import { renderActionLog } from 'xxscreeps/backend/sockets/render.js';
import { renderStore } from 'xxscreeps/mods/resource/backend.js';
import { StructureFactory } from './factory.js';

bindRenderer(StructureFactory, (factory, next, previousTime) => ({
	...next(),
	...renderStore(factory.store),
	...renderActionLog(factory['#actionLog'], previousTime),
	cooldown: factory.cooldown,
	level: factory.level,
}));
