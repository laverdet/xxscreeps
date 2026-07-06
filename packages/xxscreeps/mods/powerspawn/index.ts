import type { Manifest } from 'xxscreeps/config/mods.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/construction',
		'xxscreeps/mods/controller',
		'xxscreeps/mods/creep',
		'xxscreeps/mods/resource',
		'xxscreeps/mods/structure',
	],
	provides: [ 'backend', 'driver', 'game', 'processor', 'schema', 'test' ],
};
