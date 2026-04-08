import { bindRenderer } from 'xxscreeps/backend/index.js';
import { renderStore } from 'xxscreeps/mods/resource/backend.js';
import { StructureTerminal } from './terminal.js';

bindRenderer(StructureTerminal, (terminal, next) => ({
	...next(),
	...renderStore(terminal.store),
	cooldown: terminal.cooldown,
}));
