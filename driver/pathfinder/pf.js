module.exports = require('./build/Release/pf.node');
module.exports.relativePath = './build/Release/pf.node';
if (module.exports.version !== 11) {
	throw new Error('pf.node is out of date. Please reinstall.');
}
