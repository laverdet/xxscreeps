import type { Manifest } from 'xxscreeps/config/mods.js';

export const manifest: Manifest = {
	dependencies: [ 'xxscreeps/mods/meta/notifications' ],
	provides: [ 'backend', 'driver', 'main', 'processor', 'test' ],
};
