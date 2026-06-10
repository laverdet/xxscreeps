import type { Format } from 'xxscreeps/schema/format.js';
import type { LayoutAndTraits } from 'xxscreeps/schema/layout.js';
import { getName } from 'xxscreeps/schema/format.js';
import { getLayout } from 'xxscreeps/schema/layout.js';
import packages from 'xxscreeps:packages';

export function build(format: Format, cache = new Map<Format, LayoutAndTraits>()) {
	return {
		...getLayout(format, cache),
		...packages[getName(format)!],
	};
}

export const makeUpgrader = () => () => { throw new Error('Blob upgrade not available'); };
