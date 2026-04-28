import type { Schema } from './config.js';
import * as fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import jsYaml from 'js-yaml';
import { isTopThread } from 'xxscreeps/engine/service/index.js';

// Load configuration
export const configPath = new URL('.screepsrc.yaml', `${pathToFileURL(process.cwd())}/`);
const content = await async function() {
	try {
		return await fs.readFile(configPath, 'utf8');
	} catch {}
}();
const config = function(): Schema {
	if (content === undefined) {
		if (isTopThread) {
			console.warn('`.screepsrc.yaml` not found; using default configuration');
		}
		return {};
	} else {
		return jsYaml.load(content) as Schema;
	}
}();
export default config;
