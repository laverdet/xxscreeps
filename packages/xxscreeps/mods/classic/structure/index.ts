import type { Manifest } from 'xxscreeps/config/mods.js';
import * as types from 'xxscreeps/tsroot.js';

export const manifest: Manifest = {
	provides: [ 'backend', 'constants', 'game', 'processor', 'test' ],
	types,
};
