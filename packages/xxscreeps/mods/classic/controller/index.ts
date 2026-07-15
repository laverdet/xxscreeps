import type { Manifest } from 'xxscreeps/config/mods.js';
import * as types from 'xxscreeps/tsroot.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/classic/creep',
		'xxscreeps/mods/meta/notifications',
		'xxscreeps/mods/classic/structure',
	],
	provides: [ 'backend', 'constants', 'driver', 'game', 'processor', 'schema', 'test' ],
	types,
};
