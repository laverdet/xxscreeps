import type { Manifest } from 'xxscreeps/config/mods/index.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/construction',
		'xxscreeps/mods/notifications',
		'xxscreeps/mods/resource',
		'xxscreeps/mods/structure',
	],
	provides: [ 'backend', 'game', 'processor', 'test' ],
};
