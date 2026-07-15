import type { Manifest } from 'xxscreeps/config/mods.js';
import * as types from 'xxscreeps/tsroot.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/modern/factory',
		'xxscreeps/mods/classic/harvestable',
		'xxscreeps/mods/classic/resource',
	],
	provides: [ 'backend', 'game', 'main', 'processor', 'schema', 'test' ],
	types,
};
