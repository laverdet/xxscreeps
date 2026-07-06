import type { Manifest } from 'xxscreeps/config/mods.js';

export const manifest: Manifest = {
	dependencies: [ 'xxscreeps/mods/structure' ],
	provides: [ 'backend', 'constants', 'game', 'processor', 'schema', 'test' ],
};
