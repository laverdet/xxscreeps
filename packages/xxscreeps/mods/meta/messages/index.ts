import type { Manifest } from 'xxscreeps/config/mods.js';

export const manifest: Manifest = {
	// Depends on `notifications` for the message-notification integration (prefs + enqueue).
	dependencies: [ 'xxscreeps/mods/meta/notifications' ],
	provides: [ 'backend', 'test' ],
};
