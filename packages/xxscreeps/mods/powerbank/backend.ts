import { bindMapRenderer, bindRenderer, bindTerrainRenderer } from 'xxscreeps/backend/index.js';
import { renderStore } from 'xxscreeps/mods/resource/backend.js';
import { StructurePowerBank } from './powerbank.js';

bindMapRenderer(StructurePowerBank, () => 'pb');
bindTerrainRenderer(StructurePowerBank, () => 0xf41f33);

bindRenderer(StructurePowerBank, (powerBank, next) => ({
	...next(),
	...renderStore(powerBank.store),
	decayTime: powerBank['#nextDecayTime'],
}));
