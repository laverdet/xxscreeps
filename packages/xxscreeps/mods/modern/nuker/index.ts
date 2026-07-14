import type { Manifest } from 'xxscreeps/config/mods.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/classic/construction',
		'xxscreeps/mods/classic/controller',
		'xxscreeps/mods/classic/creep',
		'xxscreeps/mods/classic/defense',
		'xxscreeps/mods/meta/notifications',
		'xxscreeps/mods/classic/resource',
		'xxscreeps/mods/classic/structure',
	],
	// TODO: dev dependencies?
	// 'xxscreeps/mods/classic/spawn',
	provides: [ 'backend', 'constants', 'game', 'processor', 'schema', 'test' ],
};
