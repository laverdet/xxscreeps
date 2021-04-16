import type { Manifest } from 'xxscreeps/config/mods';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/harvestable',
		'xxscreeps/mods/resource',
		'xxscreeps/mods/structure',
	],
	provides: [ 'backend', 'constants', 'game', 'processor' ],
};
