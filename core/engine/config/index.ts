import Ajv from 'ajv';
import fs from 'fs';
import Path from 'path';
import jsYaml from 'js-yaml';
import jsonSchema from './config.schema.json';
import { Schema } from './schema';

const ajv = new Ajv;
const validate = ajv.compile(jsonSchema);

const configPath = Path.resolve('.screepsrc.yaml');
const config = jsYaml.safeLoad(fs.readFileSync(configPath, 'utf8')) as Schema;

if (validate(config) !== true) {
	throw new Error(`Configuration error in: ${configPath}\n${ajv.errorsText()}`);
}

export default config;
export { configPath };
