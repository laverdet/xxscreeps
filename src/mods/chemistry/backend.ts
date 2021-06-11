import { bindRenderer } from 'xxscreeps/backend';
import { renderStore } from 'xxscreeps/mods/resource/backend';
import { StructureLab } from './lab';

bindRenderer(StructureLab, (lab, next) => ({
	...next(),
	...renderStore(lab.store),
	cooldown: lab.cooldown,
}));
