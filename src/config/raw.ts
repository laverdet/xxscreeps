import type { Schema } from './schema';
import path from 'path';
import jsYaml from 'js-yaml';
import { isMainThread, workerData } from 'worker_threads';
import { pathToFileURL } from 'url';
import { promises as fs } from 'fs';

export const configPath = pathToFileURL(path.resolve('.screepsrc.yaml'));
const content = await async function() {
	try {
		return await fs.readFile(configPath, 'utf8');
	} catch (err) {}
}();
const config = function(): Schema {
	if (content) {
		return jsYaml.load(content) as Schema;
	} else {
		if (isMainThread || workerData?.isTopThread) {
			console.warn('`.screepsrc.yaml` not found; using default configuration');
		}
		return {};
	}
}();
export default config;
