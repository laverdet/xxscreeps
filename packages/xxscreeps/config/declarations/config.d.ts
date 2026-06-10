declare module 'xxscreeps:mods/config' {
	import type { Config } from 'xxscreeps/config/index.js';

	export const defaults: readonly Config[];
	export const initializationDefaults: readonly Config[];
	export const schemas: readonly Record<string, unknown>[];
}
