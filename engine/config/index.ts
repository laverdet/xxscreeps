import Ajv from 'ajv';
import fs from 'fs';
import Path from 'path';
import { safeLoad } from 'js-yaml';
import jsonSchema from './config.schema.json';
import { Schema } from './schema';

const ajv = new Ajv;
const validate = ajv.compile(jsonSchema);

const configPath = Path.resolve('.screepsrc.yaml');
const config: Schema = safeLoad(fs.readFileSync(configPath, 'utf8'));

if (validate(config) !== true) {
	throw new Error(`Configuration error in: ${configPath}\n${ajv.errorsText()}`);
}

export default config;
export { configPath };
