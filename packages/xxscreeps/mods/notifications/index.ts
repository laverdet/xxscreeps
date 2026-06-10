import type { Manifest } from 'xxscreeps/config/mods.js';

export const manifest: Manifest = {
	dependencies: [ 'xxscreeps/mods/creep', 'xxscreeps/mods/structure' ],
	provides: [ 'driver', 'game', 'main', 'processor', 'test' ],
};
