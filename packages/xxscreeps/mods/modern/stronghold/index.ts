import type { Manifest } from 'xxscreeps/config/mods.js';
import * as types from 'xxscreeps/tsroot.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/classic/combat',
		'xxscreeps/mods/classic/construction',
		'xxscreeps/mods/classic/controller',
		'xxscreeps/mods/classic/creep',
		'xxscreeps/mods/classic/defense',
		'xxscreeps/mods/classic/invader',
		'xxscreeps/mods/classic/logistics',
		'xxscreeps/mods/classic/resource',
		'xxscreeps/mods/classic/road',
		'xxscreeps/mods/classic/spawn',
		'xxscreeps/mods/modern/effects',
		'xxscreeps/mods/modern/factory',
		'xxscreeps/mods/modern/nuker',
		'xxscreeps/mods/modern/sector',
		'xxscreeps/mods/npc',
	],
	provides: [ 'backend', 'constants', 'game', 'main', 'processor', 'schema', 'test' ],
	types,
};
