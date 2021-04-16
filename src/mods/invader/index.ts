import type { Manifest } from 'xxscreeps/config/mods';
export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/creep',
		'xxscreeps/mods/npc',
	],
	provides: [ 'backend', 'constants', 'game', 'processor' ],
};
