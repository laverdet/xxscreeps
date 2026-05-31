const triplet = require('./triplet.js');

const name = `@xxscreeps/pathfinder-${triplet}/pf.${triplet}.node`;
const path = require.resolve(name);
module.exports = require(path);
module.exports.path = path;
if (![ 11, 12 ].includes(module.exports.version)) {
	throw new Error('pf.node is out of date. Please reinstall.');
}
