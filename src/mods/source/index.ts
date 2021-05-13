import type { Manifest } from 'xxscreeps/config/mods';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/creep',
		'xxscreeps/mods/harvestable',
		'xxscreeps/mods/resource',
	],
	provides: [ 'backend', 'constants', 'game', 'processor' ],
};
