const triplet = require('./triplet.js');

const name = `@xxscreeps/pathfinder-${triplet}/pf.${triplet}.node`;
const path = require.resolve(name);
module.exports = require(path);
module.exports.path = path;
if (module.exports.version !== 11) {
	throw new Error('pf.node is out of date. Please reinstall.');
}
