import type { Manifest } from 'xxscreeps/config/mods.js';
import * as types from 'xxscreeps/tsroot.js';

export const manifest: Manifest = {
	// Placing a decoration checks that the player controls or reserves the room.
	dependencies: [ 'xxscreeps/mods/classic/controller' ],
	provides: [ 'config', 'test' ],
	types,
};
