import Ajv from 'ajv';
import Path from 'path';
import jsYaml from 'js-yaml';
import { promises as fs } from 'fs';
import jsonSchema from './config.schema.json';
import { MergedSchema, defaults } from './defaults';
import { merge } from 'xxscreeps/utility/utility';

const ajv = new Ajv;
const validate = ajv.compile(jsonSchema);

const configPath = Path.resolve('.screepsrc.yaml');
const data = jsYaml.safeLoad(await fs.readFile(configPath, 'utf8'));
if (validate(data) !== true) {
	throw new Error(`Configuration error in: ${configPath}\n${ajv.errorsText()}`);
}

const config: MergedSchema = defaults as never;
merge(config, data);

export default config;
export { configPath };
