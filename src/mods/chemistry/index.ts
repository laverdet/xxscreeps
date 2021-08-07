import type { Manifest } from 'xxscreeps/config/mods';

export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/mineral',
		'xxscreeps/mods/resource',
		'xxscreeps/mods/structure',
	],
	provides: [ 'backend', 'constants', 'game', 'processor' ],
};
