import type { Schema } from './config.js';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isMainThread, workerData } from 'node:worker_threads';
import jsYaml from 'js-yaml';

export const isTopThread: boolean = isMainThread || workerData?.isTopThread;

export const configPath = new URL('.screepsrc.yaml', `${pathToFileURL(process.cwd())}/`);
const content = await async function() {
	try {
		return await fs.readFile(configPath, 'utf8');
	} catch (err) {}
}();
const config = function(): Schema {
	if (content) {
		return jsYaml.load(content) as Schema;
	} else {
		if (isTopThread) {
			console.warn('`.screepsrc.yaml` not found; using default configuration');
		}
		return {};
	}
}();
export default config;
