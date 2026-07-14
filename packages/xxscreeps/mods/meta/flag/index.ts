import type { Manifest } from 'xxscreeps/config/mods.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/meta/memory',
	],
	provides: [ 'backend', 'constants', 'driver', 'game', 'schema', 'test' ],
};
