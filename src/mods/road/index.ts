import type { Manifest } from 'xxscreeps/config/mods/index.js';
export const manifest: Manifest = {
	dependencies: [ 'xxscreeps/mods/structure' ],
	provides: [ 'backend', 'constants', 'game', 'processor', 'test' ],
};
