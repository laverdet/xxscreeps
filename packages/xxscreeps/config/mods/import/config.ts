import * as Config from 'xxscreeps/config/config.js';

// It's in package.json
throw new Error('nodejs is misconfigured');

interface ModConfig {
	configDefaults?: never;
	defaults?: never;
}

declare const DynamicConfig: [ typeof Config, ModConfig ];
export default DynamicConfig;
