import type { Manifest } from 'xxscreeps/config/mods';
export const manifest: Manifest = {
	dependencies: [ 'xxscreeps/mods/creep' ],
	provides: [ 'constants', 'game', 'processor' ],
};
