import type { Manifest } from 'xxscreeps/config/mods.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/powerspawn',
	],
	provides: [ 'backend', 'driver', 'game', 'test' ],
};
