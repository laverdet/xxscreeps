import type { Manifest } from 'xxscreeps/config/mods.js';

export const manifest: Manifest = {
	// Scores are derived from stat contributions, via the `flush` hook of that mod.
	dependencies: [ 'xxscreeps/mods/meta/stats' ],
	provides: [ 'backend', 'processor', 'test' ],
};
