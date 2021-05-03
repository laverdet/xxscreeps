import type { Manifest } from 'xxscreeps/config/mods';
export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/memory',
	],
	provides: [ 'backend', 'constants', 'driver', 'game' ],
};
