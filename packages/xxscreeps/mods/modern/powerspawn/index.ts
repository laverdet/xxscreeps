import type { Manifest } from 'xxscreeps/config/mods.js';
import * as types from 'xxscreeps/tsroot.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/classic/construction',
		'xxscreeps/mods/classic/controller',
		'xxscreeps/mods/classic/creep',
		'xxscreeps/mods/classic/resource',
		'xxscreeps/mods/classic/structure',
	],
	provides: [ 'backend', 'driver', 'game', 'processor', 'schema', 'test' ],
	types,
};
