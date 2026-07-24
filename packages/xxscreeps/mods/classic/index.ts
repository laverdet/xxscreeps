import type { Manifest } from 'xxscreeps/config/mods.js';
import * as types from 'xxscreeps/tsroot.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/classic/brokerage',
		'xxscreeps/mods/classic/chemistry',
		'xxscreeps/mods/classic/defense',
		'xxscreeps/mods/classic/logistics',
		'xxscreeps/mods/classic/road',
		'xxscreeps/mods/classic/source',
		'xxscreeps/mods/classic/spawn',

		'xxscreeps/mods/meta/flag',
		'xxscreeps/mods/meta/messages',
		'xxscreeps/mods/meta/notifications',
		'xxscreeps/mods/meta/stats',
		'xxscreeps/mods/meta/visual',

		'xxscreeps/mods/modern/deposit',
		'xxscreeps/mods/modern/factory',
		'xxscreeps/mods/modern/nuker',
		'xxscreeps/mods/modern/observer',
		'xxscreeps/mods/modern/powerbank',
		'xxscreeps/mods/modern/powerspawn',

		'xxscreeps/mods/mmo/powercreep',
		'xxscreeps/mods/mmo/wallstreet',

		'xxscreeps/mods/portal',
		'xxscreeps/mods/invader',
		'xxscreeps/mods/intershardResource',
	],
	provides: null,
	types,
};
