import type { Manifest } from 'xxscreeps/config/mods.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/classic/combat',
		'xxscreeps/mods/classic/controller',
		'xxscreeps/mods/classic/creep',
		'xxscreeps/mods/classic/defense',
		'xxscreeps/mods/classic/logistics',
		'xxscreeps/mods/npc',
		'xxscreeps/mods/classic/spawn',
	],
	provides: [ 'backend', 'constants', 'game', 'processor', 'schema', 'test' ],
};
