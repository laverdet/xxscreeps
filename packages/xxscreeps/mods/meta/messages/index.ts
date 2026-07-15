import type { Manifest } from 'xxscreeps/config/mods.js';
import * as types from 'xxscreeps/tsroot.js';

export const manifest: Manifest = {
	// Depends on `notifications` for the message-notification integration (prefs + enqueue).
	dependencies: [ 'xxscreeps/mods/meta/notifications' ],
	provides: [ 'backend', 'test' ],
	types,
};
