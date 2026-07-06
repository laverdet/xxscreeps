import type { Manifest } from 'xxscreeps/config/mods.js';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/combat',
		'xxscreeps/mods/creep',
		'xxscreeps/mods/resource',
		'xxscreeps/mods/structure',
	],
	provides: [ 'backend', 'game', 'main', 'processor', 'schema', 'test' ],
};
