import type { Manifest } from 'xxscreeps/config/mods';
export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/creep',
		'xxscreeps/mods/structure',
	],
	provides: [ 'backend', 'constants', 'driver', 'game', 'processor' ],
};
