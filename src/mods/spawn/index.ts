import type { Manifest } from 'xxscreeps/config/mods/index.js';
export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/construction',
		'xxscreeps/mods/controller',
		'xxscreeps/mods/memory',
		'xxscreeps/mods/resource',
		'xxscreeps/mods/structure',
	],
	provides: [ 'backend', 'constants', 'game', 'processor', 'test' ],
};
