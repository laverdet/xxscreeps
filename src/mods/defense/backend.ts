import { bindRenderer } from 'xxscreeps/backend';
import { renderStore } from 'xxscreeps/mods/resource/backend';
import { StructureTower } from './tower';

bindRenderer(StructureTower, (tower, next) => ({
	...next(),
	...renderStore(tower.store),
}));
