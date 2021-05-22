import type { Schema } from './schema';
import path from 'path';
import jsYaml from 'js-yaml';
import { pathToFileURL } from 'url';
import { promises as fs } from 'fs';

export const configPath = pathToFileURL(path.resolve('.screepsrc.yaml'));
export default jsYaml.load(await fs.readFile(configPath, 'utf8')) as Schema;
