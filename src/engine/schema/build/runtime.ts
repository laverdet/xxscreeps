import packages from 'xxscreeps/engine/schema/build/packages.js';
import { getName } from 'xxscreeps/schema/format.js';
import { getLayout } from 'xxscreeps/schema/layout.js';
export function build(format: any, cache = new Map) {
	return {
		...getLayout(format, cache),
		...packages[getName(format)!],
	};
}

export const makeUpgrader = () => () => { throw new Error('Blob upgrade not available') };
