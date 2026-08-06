import type { Manifest } from 'xxscreeps/config/mods.js';

export const manifest: Manifest = {
	// Placing a decoration checks that the player controls or reserves the room.
	dependencies: [ 'xxscreeps/mods/classic/controller' ],
	provides: [ 'backend', 'config', 'test' ],
};
