import type { Manifest } from 'xxscreeps/config/mods.js';
import * as types from 'xxscreeps/tsroot.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/classic/creep',
		'xxscreeps/mods/classic/structure',
	],
	provides: [ 'backend', 'game', 'processor', 'schema', 'test' ],
	types,
};
