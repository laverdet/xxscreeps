const id = process.arch + '-' + process.platform + '-' + process.version;
// The expression must be duplicated for Webpack reasons
module.exports = require(`./out/${id}/pf.node`);
module.exports.path = require.resolve(`./out/${id}/pf.node`);
if (module.exports.version !== 11) {
	throw new Error('pf.node is out of date. Please reinstall.');
}
