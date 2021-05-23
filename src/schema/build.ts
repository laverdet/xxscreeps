import type { Format, ShapeOf, TypeOf, WithShapeAndType } from './format';
import type { LayoutAndTraits } from './layout';
import crypto from 'crypto';
import { archiveLayout } from './archive';
import { getLayout } from './layout';
import { getName } from 'xxscreeps/schema/format';

export interface Package extends LayoutAndTraits {
	archive: string;
	name: string;
	version: number;
}

export function build<Type extends Format>(format: Type, cache = new Map<Format, LayoutAndTraits>()) {
	const name = getName(format);
	if (name === null) {
		throw new Error('`build` requires named schema');
	}
	const layout = getLayout(format, cache);
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	const { archive, version } = crypto.createHash === undefined ? {
		archive: '?',
		version: -1,
	} : function() {
		const archive = archiveLayout(layout.layout);
		const hash = crypto.createHash('sha1');
		hash.update(archive);
		const digest = hash.digest();
		const version = digest.readUInt32LE(0);
		return { archive, version };
	}();
	const result = {
		...layout,
		archive,
		name,
		version,
	};
	return result as WithShapeAndType<ShapeOf<Type>, TypeOf<Type>> & typeof result;
}
