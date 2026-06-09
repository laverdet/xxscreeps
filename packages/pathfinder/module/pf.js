import { createRequire } from 'node:module';
import triplet from './triplet.js';

const require = createRequire(import.meta.url);
export const path = require.resolve(`@xxscreeps/pathfinder-${triplet}/pf.${triplet}.node`);
export const { loadTerrain, search, version } = require(path);
if (version !== 12) {
	throw new Error('pf.node is out of date. Please reinstall.');
}
