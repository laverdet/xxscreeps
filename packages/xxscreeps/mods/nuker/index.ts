import type { Manifest } from 'xxscreeps/config/mods/index.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/construction',
		'xxscreeps/mods/controller',
		'xxscreeps/mods/creep',
		'xxscreeps/mods/defense',
		'xxscreeps/mods/notifications',
		'xxscreeps/mods/resource',
		'xxscreeps/mods/structure',
	],
	// TODO: dev dependencies?
	// 'xxscreeps/mods/spawn',
	provides: [ 'backend', 'constants', 'game', 'processor', 'test' ],
};
