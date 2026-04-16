import type { Manifest } from 'xxscreeps/config/mods/index.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/creep',
		'xxscreeps/mods/harvestable',
		'xxscreeps/mods/resource',
		'xxscreeps/mods/structure',
	],
	provides: [ 'backend', 'constants', 'game', 'processor' ],
};
