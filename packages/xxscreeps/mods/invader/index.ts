import type { Manifest } from 'xxscreeps/config/mods.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/combat',
		'xxscreeps/mods/controller',
		'xxscreeps/mods/creep',
		'xxscreeps/mods/defense',
		'xxscreeps/mods/logistics',
		'xxscreeps/mods/npc',
		'xxscreeps/mods/spawn',
	],
	provides: [ 'backend', 'constants', 'game', 'processor', 'test' ],
};
