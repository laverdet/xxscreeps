import type { Manifest } from 'xxscreeps/config/mods.js';
import * as types from 'xxscreeps/tsroot.js';

export const manifest: Manifest = {
	dependencies: [ 'xxscreeps/mods/classic/creep' ],
	provides: [ 'constants', 'game', 'processor', 'schema' ],
	types,
};
