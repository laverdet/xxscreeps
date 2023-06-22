import type { Manifest } from 'xxscreeps/config/mods/index.js';
export const manifest: Manifest = {
	dependencies: [
		'xxscreeps/mods/combat',
		'xxscreeps/mods/creep',
		'xxscreeps/mods/npc',
	],
	provides: [ 'backend', 'constants', 'game', 'processor' ],
};
