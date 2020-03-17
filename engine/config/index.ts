import { promises as fs } from 'fs';
import { resolve } from 'path';
import Ajv from 'ajv';
import { safeLoad } from 'js-yaml';
import schema from './config.schema.json';

const ajv = new Ajv;
const validate = ajv.compile(schema);

export default (async() => {
	const file = resolve('.screepsrc.yaml');
	const config = safeLoad(await fs.readFile(file, 'utf8'));
	if (validate(config) !== true) {
		throw new Error(`Configuration error in: ${file}\n${ajv.errorsText()}`);
	}
	return { file, config };
})();
