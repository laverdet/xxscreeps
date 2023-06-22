import type { Manifest } from 'xxscreeps/config/mods/index.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/structure',
	],
	provides: [ 'constants', 'game', 'processor', 'test' ],
};
