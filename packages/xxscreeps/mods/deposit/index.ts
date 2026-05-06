import type { Manifest } from 'xxscreeps/config/mods/index.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/factory',
		'xxscreeps/mods/harvestable',
		'xxscreeps/mods/resource',
	],
	provides: [ 'backend', 'game', 'processor', 'test' ],
};
