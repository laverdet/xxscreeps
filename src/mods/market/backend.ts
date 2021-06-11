import { bindRenderer } from 'xxscreeps/backend';
import { renderStore } from 'xxscreeps/mods/resource/backend';
import { StructureTerminal } from './terminal';

bindRenderer(StructureTerminal, (terminal, next) => ({
	...next(),
	...renderStore(terminal.store),
	cooldown: terminal.cooldown,
}));
