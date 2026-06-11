import type { Config } from './config.js';
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
const config = function(): Config {
	if (content === undefined) {
		if (isTopThread) {
			console.warn('`.screepsrc.yaml` not found; using default configuration');
		}
		return {};
	} else {
		return jsYaml.load(content) as Config;
	}
}();

// Allow `runner.sandbox` override via global command-line flag
const sandbox = process.argv.indexOf('--sandbox');
if (sandbox !== -1) {
	const value = process.argv.splice(sandbox, 2)[1];
	if (value === 'experimental' || value === 'unsafe' || value === 'isolated') {
		config.runner ??= {};
		config.runner.sandbox = value;
	} else {
		throw new Error(`Invalid argument: --sandbox '${value}'`);
	}
}

export default config;
