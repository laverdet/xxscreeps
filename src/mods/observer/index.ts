import type { Manifest } from 'xxscreeps/config/mods';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/structure',
	],
	provides: [ 'constants', 'game', 'processor', 'test' ],
};
