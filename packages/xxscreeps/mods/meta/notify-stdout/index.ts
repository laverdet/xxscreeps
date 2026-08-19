import type { Manifest } from 'xxscreeps/config/mods.js';
import * as types from 'xxscreeps/tsroot.js';

export const manifest: Manifest = {
	dependencies: [ 'xxscreeps/mods/meta/notifications' ],
	provides: [ 'backend', 'driver', 'processor' ],
	types,
};
