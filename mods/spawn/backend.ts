import { bindRenderer } from 'xxscreeps/backend';
import { renderStore } from 'xxscreeps/mods/resource/backend';
import { StructureExtension } from './extension';
import { StructureSpawn } from './spawn';

bindRenderer(StructureExtension, (extension, next) => ({
	...next(),
	...renderStore(extension.store),
}));

bindRenderer(StructureSpawn, (spawn, next) => ({
	...next(),
	...renderStore(spawn.store),
	name: spawn.name,
}));
