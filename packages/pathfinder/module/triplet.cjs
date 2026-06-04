const { readFileSync } = require('node:fs');
const { arch, platform } = require('node:process');

module.exports = function() {
	if (platform === 'linux') {
		try {
			if (readFileSync('/usr/bin/ldd', 'latin1').includes('ld-musl-')) {
				return `linux-${arch}-musl`;
			}
		} catch {}
		return `linux-${arch}-gnu`;
	} else {
		return `${platform}-${arch}`;
	}
}();
