import type { Manifest } from 'xxscreeps/config/mods/index.js';
export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/creep',
		'xxscreeps/mods/structure',
	],
	provides: [ 'backend', 'constants', 'driver', 'game', 'processor', 'test' ],
};
