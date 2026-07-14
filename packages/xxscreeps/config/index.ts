import type { Config } from './config.js';
import { Ajv } from 'ajv';
import { merge } from 'xxscreeps/utility/utility.js';
import { defaults, initializationDefaults, schemas } from 'xxscreeps:mods/config';
import * as Base from './config.js';
import raw, { configPath } from './raw.js';

export { configPath } from './raw.js';

/**
 * Generate a default '.screepsrc.yaml' config
 * @internal
 */
export function makeInitializationDefaults(): Config {
	const config = {};
	merge(config, Base.initializationDefaults);
	for (const from of initializationDefaults) {
		merge(config, from);
	}
	return config;
}

// Merge defaults into config data
type MergedConfig = Config & typeof import('./config.js').defaults & typeof import('./config.js').initializationDefaults;
export const config = {} as MergedConfig;
merge(config, makeInitializationDefaults());
merge(config, Base.defaults);
for (const from of defaults) {
	merge(config, from);
}
merge(config, raw);

// Merge config schemas
export const schema = {
	$schema: Base.schema.$schema,
	definitions: Object.assign(
		{ ...Base.schema.definitions },
		...schemas.map(({ definitions }) => definitions),
	) as unknown,
	allOf: [
		{ type: 'object', properties: Base.schema.properties },
		...schemas.map(({ properties }) => ({ type: 'object', properties })),
	],
};

// Check '.screepsrc.yaml' validity
const ajv = new Ajv();
if (!ajv.validate(schema, config)) {
	throw new Error(`'${configPath.pathname}': ${ajv.errorsText()}`);
}
