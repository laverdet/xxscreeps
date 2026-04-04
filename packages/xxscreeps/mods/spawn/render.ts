import { Game } from 'xxscreeps/game/index.js';
import { bindRenderer } from 'xxscreeps/game/render.js';
import { renderStore } from 'xxscreeps/mods/resource/render.js';
import { StructureExtension } from './extension.js';
import * as Spawn from './spawn.js';

bindRenderer(StructureExtension, (extension, next) => ({
	...next(),
	...renderStore(extension.store),
}));

bindRenderer(Spawn.StructureSpawn, (spawn, next) => ({
	...next(),
	...renderStore(spawn.store),
	name: spawn.name,
	...spawn.spawning && {
		spawning: {
			name: spawn.spawning.name,
			directions: spawn.spawning.directions,
			needTime: spawn.spawning.needTime,
			spawnTime: Game.time + spawn.spawning.remainingTime,
		},
	},
}));
