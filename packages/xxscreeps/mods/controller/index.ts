import type { Manifest } from 'xxscreeps/config/mods.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/creep',
		'xxscreeps/mods/notifications',
		'xxscreeps/mods/structure',
	],
	provides: [ 'backend', 'constants', 'driver', 'game', 'processor', 'test' ],
};
