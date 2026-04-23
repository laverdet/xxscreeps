import type { Schema } from './config.js';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import Config from 'xxscreeps/config/mods/import/config.js';
import { merge } from 'xxscreeps/utility/utility.js';
import data, { configPath, isTopThread } from './raw.js';
import './global.js';
import './mods/index.js';

if (isTopThread) {
	const schema = await async function(): Promise<unknown> {
		try {
			const path = import.meta.resolve('./mods.static/config.schema.json');
			return JSON.parse(await fs.readFile(new URL(path), 'utf8'));
		} catch {}
	}();
	if (schema) {
		const ajv = new Ajv();
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
	merge(config, entry.defaults ?? {});
	merge(config, entry.configDefaults ?? {});
}

merge(config, data);
type ConfigInfo = typeof Config[number];
type MergedSchema = Schema & ConfigInfo['configDefaults'] & ConfigInfo['defaults'];

export default config as MergedSchema;
export { configPath };
