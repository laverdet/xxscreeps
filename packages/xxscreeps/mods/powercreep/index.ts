import type { Manifest } from 'xxscreeps/config/mods.js';
import * as types from 'xxscreeps/tsroot.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/modern/powerspawn',
	],
	provides: [ 'backend', 'constants', 'driver', 'game', 'schema', 'test' ],
	types,
};
