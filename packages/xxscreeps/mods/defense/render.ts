import { renderActionLog } from 'xxscreeps/backend/sockets/render.js';
import { Game } from 'xxscreeps/game/index.js';
import { bindMapRenderer, bindRenderer } from 'xxscreeps/game/render.js';
import { renderStore } from 'xxscreeps/mods/resource/render.js';
import { StructureRampart } from './rampart.js';
import { StructureTower } from './tower.js';
import { StructureWall } from './wall.js';

bindMapRenderer(StructureWall, () => 'w');

bindRenderer(StructureRampart, (rampart, next) => ({
	...next(),
	isPublic: rampart.isPublic,
	nextDecayTime: Game.time + rampart.ticksToDecay,
}));

bindRenderer(StructureTower, (tower, next, previousTime) => ({
	...next(),
	...renderStore(tower.store),
	...renderActionLog(tower['#actionLog'], previousTime),
}));
