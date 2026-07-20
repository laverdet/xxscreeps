import type { Manifest } from 'xxscreeps/config/mods.js';
import * as types from 'xxscreeps/tsroot.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/classic/combat',
		'xxscreeps/mods/classic/creep',
		'xxscreeps/mods/classic/resource',
		'xxscreeps/mods/classic/structure',
		'xxscreeps/mods/modern/sector',
	],
	provides: [ 'backend', 'constants', 'game', 'main', 'processor', 'schema', 'test' ],
	types,
};
