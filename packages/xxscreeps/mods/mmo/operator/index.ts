import type { Manifest } from 'xxscreeps/config/mods.js';
import * as types from 'xxscreeps/tsroot.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/mmo/powercreep',
		'xxscreeps/mods/modern/effects',
		'xxscreeps/mods/modern/factory',
	],
	provides: [ 'backend', 'game', 'processor', 'test' ],
	types,
};
