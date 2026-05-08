const triplet = require('./triplet.js');

const name = `@xxscreeps/pathfinder-${triplet}/pf.${triplet}.node`;
let path;
try {
	path = require.resolve(name);
} catch (cause) {
	if (cause.code !== 'MODULE_NOT_FOUND') throw cause;
	throw new Error(
		`Native pathfinder binary missing for ${triplet}. ` +
		`Install the optional dependency \`@xxscreeps/pathfinder-${triplet}\` ` +
		`(some package managers skip optionalDependencies; ` +
		`re-run install with \`--include=optional\` or check that ${triplet} is in the supported matrix).`,
		{ cause });
}
module.exports = require(path);
module.exports.path = path;
if (module.exports.version !== 11) {
	throw new Error('pf.node is out of date. Please reinstall.');
}
