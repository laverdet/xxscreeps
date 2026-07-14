declare module 'xxscreeps:mods/config' {
	import type { Config } from 'xxscreeps/config/index.js';

	export const defaults: readonly Config[];
	export const initializationDefaults: readonly Config[];

	interface Schema {
		$ref: string;
		$schema: string;
		definitions?: Record<string, unknown>;
		properties: Record<string, unknown>;
	}
	export const schemas: readonly Schema[];
}
