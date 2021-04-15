import type { Schema } from './schema';
import path from 'path';
import jsYaml from 'js-yaml';
import { promises as fs } from 'fs';

export const configPath = path.resolve('.screepsrc.yaml');
export default jsYaml.safeLoad(await fs.readFile(configPath, 'utf8')) as Schema;
