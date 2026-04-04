import { bindRenderer } from 'xxscreeps/game/render.js';
import { renderStore } from 'xxscreeps/mods/resource/render.js';
import { StructureTerminal } from './terminal.js';

bindRenderer(StructureTerminal, (terminal, next) => ({
	...next(),
	...renderStore(terminal.store),
	cooldown: terminal.cooldown,
}));
