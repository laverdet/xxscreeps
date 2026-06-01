import { bindRenderer } from 'xxscreeps/backend/index.js';
import { renderStore } from 'xxscreeps/mods/resource/backend.js';
import { Nuke } from './nuke.js';
import { StructureNuker } from './nuker.js';

bindRenderer(StructureNuker, (nuker, next) => ({
	...next(),
	...renderStore(nuker.store),
	cooldown: nuker.cooldown,
}));

bindRenderer(Nuke, (nuke, next) => ({
	...next(),
	launchRoomName: nuke.launchRoomName,
	timeToLand: nuke.timeToLand,
}));
