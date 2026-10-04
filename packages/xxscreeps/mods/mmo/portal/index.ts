import type { Manifest } from 'xxscreeps/config/mods.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/modern/sector',
		'xxscreeps/mods/portal',
	],
	provides: [ 'main', 'processor', 'test' ],
};
