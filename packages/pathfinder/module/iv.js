import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { NativeModule } from '@isolated-vm/experimental';
import triplet from './triplet.js';

const require = createRequire(import.meta.url);
export const path = require.resolve(`@xxscreeps/pathfinder-${triplet}/iv.${triplet}.node`);
export const { loadTerrain, search, version } = require(path);
export const module = await NativeModule.create(path, {
	origin: pathToFileURL(path).href,
	suffix: '',
});
if (version !== 12) {
	throw new Error('pf.node is out of date. Please reinstall.');
}
