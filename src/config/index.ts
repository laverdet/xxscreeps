import Ajv from 'ajv';
import jsonSchema from './config.schema.json';
import { MergedSchema, defaults } from './defaults';
import { merge } from 'xxscreeps/utility/utility';
import data, { configPath } from './raw';

const ajv = new Ajv;
const validate = ajv.compile(jsonSchema);
if (validate(data) !== true) {
	throw new Error(`Configuration error in: ${configPath}\n${ajv.errorsText()}`);
}

const config: MergedSchema = defaults as never;
merge(config, data);

export default config;
export { configPath };
