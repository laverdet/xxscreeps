import type { MergedSchema } from './defaults';
import Ajv from 'ajv';
import schema from './config.schema.json';
import data, { configPath } from './raw';
import { defaults } from './defaults';
import { merge } from 'xxscreeps/utility/utility';
import { fileURLToPath } from 'url';
import './global';

const ajv = new Ajv;
if (ajv.validate(schema, data) !== true) {
	throw new Error(`\`${fileURLToPath(configPath)}\`: ${ajv.errorsText()}`);
}

const config: MergedSchema = defaults as never;
merge(config, data);

export default config;
export { configPath };
