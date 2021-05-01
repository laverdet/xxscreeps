import type { Format, ShapeOf, TypeOf, WithShapeAndType } from './format';
import type { LayoutAndTraits } from './layout';
import crypto from 'crypto';
import fs from 'fs';
import { archiveLayout } from './archive';
import { getLayout } from './layout';
import { archiveStruct } from './kaitai';

export type Package = ShapeOf<any> & TypeOf<any> & LayoutAndTraits & {
	archive: string;
	version: number;
};
export function build<Type extends Format>(format: Type, archivePath: URL, cache = new Map<Format, LayoutAndTraits>()) {
	const layout = getLayout(format, cache);
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	const { archive, version } = crypto.createHash === undefined ? {
		archive: '?',
		version: 0,
	} : function() {
		const archive = archiveLayout(layout.layout);
		const hash = crypto.createHash('sha1');
		hash.update(archive);
		const digest = hash.digest();
		const version = digest.readUInt32LE(0);
		const versionId = digest.readUInt32BE(0).toString(16);
		const file = new URL(`./${versionId}.js`, archivePath);
		fs.mkdirSync(archivePath, { recursive: true });
		try {
			fs.statSync(file);
		} catch (err) {
			fs.writeFileSync(file, archive);
			fs.writeFileSync(new URL(`./${versionId}.ksy`, file), archiveStruct(layout.layout, version));
		}
		return { archive, version };
	}();
	const result = {
		...layout,
		archive,
		version,
	};
	return result as WithShapeAndType<ShapeOf<Type>, TypeOf<Type>> & typeof result;
}
