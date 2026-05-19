import type { Schema } from './config.js';
import * as fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import jsYaml from 'js-yaml';
import { isTopThread } from 'xxscreeps/engine/service/index.js';

// Load configuration
const configCandidates = [
	new URL('.screepsrc.yaml', `${pathToFileURL(process.cwd())}/`),
	new URL('.screepsrc.yaml', pathToFileURL('/data/')),
];
export const configPath = await async function() {
	for (const candidate of configCandidates) {
		try {
			await fs.stat(candidate);
			return candidate;
		} catch {}
	}
	return configCandidates[0];
}();
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
