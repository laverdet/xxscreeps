import type { Manifest } from 'xxscreeps/config/mods.js';
import * as types from 'xxscreeps/tsroot.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/classic/construction',
		'xxscreeps/mods/classic/controller',
		'xxscreeps/mods/classic/resource',
		'xxscreeps/mods/classic/structure',
		'xxscreeps/mods/meta/memory',
	],
	provides: [ 'backend', 'constants', 'game', 'processor', 'schema', 'test', 'user' ],
	types,
};
