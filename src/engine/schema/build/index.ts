import type { BufferView, Format } from 'xxscreeps/schema/index.js';
import type { Package } from 'xxscreeps/schema/build.js';
import type { Transform } from 'xxscreeps/driver/webpack.js';
import fs from 'fs';
import { build as buildSchema } from 'xxscreeps/schema/build.js';
import { restoreLayout } from 'xxscreeps/schema/archive.js';
import { archiveStruct } from 'xxscreeps/schema/kaitai.js';
import { initializeView, makeViewReader } from 'xxscreeps/schema/read.js';
import { Builder } from 'xxscreeps/schema/index.js';
import config, { configPath } from 'xxscreeps/config/index.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';

const archivePath = new URL(`${config.schemaArchive}/`, configPath);
const archivedReaders = new Map<number, (view: BufferView) => any>();
const packages = new Map<string, Package>();

function makeArchivePath(name: string, version: number, ext = 'js') {
	const versionId = version.toString(16).padStart(8, '0').split(/(?<hex>[0-9a-f]{2})/).reverse().join('');
	const pathFragment = `${name.toLowerCase()}-${versionId}`;
	return new URL(`./${pathFragment}.${ext}`, archivePath);
}

/**
 * Builds a schema package from a format and retains the result which can be used later within the
 * player runtime.
 */
export function build<Type extends Format>(format: Type, cache = new Map) {
	const result = buildSchema(format, cache);
	const file = makeArchivePath(result.name, result.version);
	fs.mkdirSync(archivePath, { recursive: true });
	try {
		fs.statSync(file);
	} catch (err) {
		fs.writeFileSync(file, result.archive);
		fs.writeFileSync(makeArchivePath(result.name, result.version, 'ksy'), archiveStruct(result.layout, result.version));
	}
	packages.set(result.name, {
		...result,
		archive: '?',
	});
	return result;
}

/**
 * Creates a function which transparently upgrades a blob to a newer schema version by first reading
 * with the old schema and writing with the new one.
 */
export function makeUpgrader(info: Package, write: (value: any) => Readonly<Uint8Array>) {
	const { name, version: expectedVersion } = info;
	return (buffer: Readonly<Uint8Array>) => {
		const { view, version } = initializeView(buffer);
		if (expectedVersion === version) {
			return buffer;
		} else {
			const reader = getOrSet(archivedReaders, version, () => {
				const archive = function() {
					try {
						return fs.readFileSync(makeArchivePath(name, version), 'utf8');
					} catch (err) {
						throw new Error(`No archived schema found for ${name} ${version}`);
					}
				}();
				const layout = restoreLayout(archive, info.layout);
				return makeViewReader({ layout, version }, new Builder({ materialize: true }));
			});
			// Read instance and nullify underlying buffer, providing defaults for unspecified members
			const value = reader(view);
			view.nullify();
			return write(value);
		}
	};
}

/**
 * Webpack transformation which replaces this file with `./runtime.ts`.
 */
export const schemaTransform: Transform = {
	alias: {
		'xxscreeps/engine/schema/build/index.js': 'xxscreeps/engine/schema/build/runtime.js',
	},
	externals: ({ request }) => {
		if (request === 'xxscreeps/engine/schema/build/packages.js') {
			return JSON.stringify(Object.fromEntries([ ...packages ].map(entry => [ entry[0], {
				version: entry[1].version,
			} ])));
		}
	},
};
