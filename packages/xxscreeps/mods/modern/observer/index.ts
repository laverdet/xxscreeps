import type { Manifest } from 'xxscreeps/config/mods.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/classic/structure',
	],
	provides: [ 'constants', 'game', 'processor', 'schema', 'test' ],
};
