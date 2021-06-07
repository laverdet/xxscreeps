import { bindMapRenderer, bindRenderer } from 'xxscreeps/backend';
import { renderActionLog } from 'xxscreeps/backend/sockets/render';
import { Game } from 'xxscreeps/game';
import { renderStore } from 'xxscreeps/mods/resource/backend';
import { StructureRampart } from './rampart';
import { StructureTower } from './tower';
import { StructureWall } from './wall';

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
