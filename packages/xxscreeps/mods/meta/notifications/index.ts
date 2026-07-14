import type { Manifest } from 'xxscreeps/config/mods.js';

export const manifest: Manifest = {
	dependencies: [ 'xxscreeps/mods/classic/creep', 'xxscreeps/mods/classic/structure' ],
	provides: [ 'backend', 'driver', 'game', 'main', 'processor', 'schema', 'test' ],
};
