import type { Manifest } from 'xxscreeps/config/mods/index.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/construction',
		'xxscreeps/mods/controller',
		'xxscreeps/mods/creep',
		'xxscreeps/mods/defense',
		'xxscreeps/mods/notifications',
		'xxscreeps/mods/resource',
		'xxscreeps/mods/spawn',
		'xxscreeps/mods/structure',
	],
	provides: [ 'backend', 'game', 'processor', 'test' ],
};
