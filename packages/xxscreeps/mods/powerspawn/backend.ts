import { bindRenderer } from 'xxscreeps/backend/index.js';
import { renderStore } from 'xxscreeps/mods/resource/backend.js';
import { StructurePowerSpawn } from './powerspawn.js';

bindRenderer(StructurePowerSpawn, (powerSpawn, next) => ({
	...next(),
	...renderStore(powerSpawn.store),
}));
