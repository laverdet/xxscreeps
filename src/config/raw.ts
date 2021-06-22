import type { Schema } from './config';
import fs from 'fs/promises';
import jsYaml from 'js-yaml';
import { isMainThread, workerData } from 'worker_threads';
import { pathToFileURL } from 'url';

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
