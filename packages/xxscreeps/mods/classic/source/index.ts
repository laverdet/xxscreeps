import type { Manifest } from 'xxscreeps/config/mods.js';
import * as types from 'xxscreeps/tsroot.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/classic/creep',
		'xxscreeps/mods/classic/harvestable',
		'xxscreeps/mods/classic/resource',
		'xxscreeps/mods/classic/structure',
	],
	provides: [ 'backend', 'constants', 'game', 'processor', 'schema', 'test' ],
	types,
};
