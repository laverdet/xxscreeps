import packages from 'xxscreeps/engine/schema/build/packages';
import { getName } from 'xxscreeps/schema/format';
import { getLayout } from 'xxscreeps/schema/layout';
export function build(format: any, cache = new Map) {
	return {
		...getLayout(format, cache),
		...packages[getName(format)!],
	};
}
