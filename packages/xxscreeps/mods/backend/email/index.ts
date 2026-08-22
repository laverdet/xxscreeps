import type { Manifest } from 'xxscreeps/config/mods.js';

export const manifest: Manifest = {
	provides: 'backend',
	dependencies: [ 'xxscreeps/mods/backend/email' ],
};
