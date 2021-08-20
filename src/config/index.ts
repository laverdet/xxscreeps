import type { Schema } from './config';
import fs from 'fs/promises';
import Ajv from 'ajv';
import Config from 'xxscreeps/config/mods/import/config';
import data, { configPath, isTopThread } from './raw';
import { merge } from 'xxscreeps/utility/utility';
import { fileURLToPath } from 'url';
import './global';
import './mods';

if (isTopThread) {
	const schema = await async function() {
		try {
			const path = await import.meta.resolve!('./mods.static/config.schema.json', import.meta.url);
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

// Merge defaults into config data
const config = {};
for (const entry of Config) {
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	merge(config, entry.defaults ?? {});
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	merge(config, entry.configDefaults ?? {});
}

merge(config, data);
type ConfigInfo = typeof Config[number];
type MergedSchema = Schema & ConfigInfo['configDefaults'] & ConfigInfo['defaults'];

export default config as MergedSchema;
export { configPath };
