import { readFileSync } from 'node:fs';
import { arch, platform } from 'node:process';

const triplet = function() {
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
export default triplet;
