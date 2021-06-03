import { bindRenderer } from 'xxscreeps/backend';
import { renderActionLog } from 'xxscreeps/backend/sockets/render';
import { renderStore } from 'xxscreeps/mods/resource/backend';
import { StructureLink } from './link';
import { StructureStorage } from './storage';

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
