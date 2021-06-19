import type { MergedSchema } from './defaults';
import fs from 'fs/promises';
import Ajv from 'ajv';
import data, { configPath, isTopThread } from './raw';
import { defaults } from './defaults';
import { merge } from 'xxscreeps/utility/utility';
import { fileURLToPath } from 'url';
import './global';
import './mods';

if (isTopThread) {
	const schema = await async function() {
		try {
			const path = await import.meta.resolve('./mods.resolved/config.schema.json', import.meta.url);
			return JSON.parse(await fs.readFile(new URL(path), 'utf8'));
		} catch (err) {}
	}();
	if (schema) {
		const ajv = new Ajv;
		if (ajv.validate(schema, data) !== true) {
			throw new Error(`\`${fileURLToPath(configPath)}\`: ${ajv.errorsText()}`);
		}
	} else {
		console.log('Failed to load config schema. `.screepsrc.yaml` validity will *not* be checked!');
	}
}

const config: MergedSchema = defaults as never;
merge(config, data);

export default config;
export { configPath };
