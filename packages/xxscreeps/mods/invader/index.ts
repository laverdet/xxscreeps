import type { Manifest } from 'xxscreeps/config/mods.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/classic/combat',
		'xxscreeps/mods/classic/construction',
		'xxscreeps/mods/classic/controller',
		'xxscreeps/mods/classic/creep',
		'xxscreeps/mods/classic/defense',
		'xxscreeps/mods/modern/factory',
		'xxscreeps/mods/classic/logistics',
		'xxscreeps/mods/npc',
		'xxscreeps/mods/classic/resource',
		'xxscreeps/mods/classic/road',
		'xxscreeps/mods/classic/spawn',
	],
	provides: [ 'backend', 'constants', 'game', 'processor', 'schema', 'test' ],
};
