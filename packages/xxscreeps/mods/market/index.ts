import type { Manifest } from 'xxscreeps/config/mods.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/classic/resource',
		'xxscreeps/mods/classic/structure',
	],
	provides: [ 'backend', 'constants', 'driver', 'game', 'main', 'processor', 'schema', 'test' ],
};
