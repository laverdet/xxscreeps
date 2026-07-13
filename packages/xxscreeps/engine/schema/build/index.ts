import type { Package } from 'xxscreeps/schema/build.js';
import type { BufferView, Format } from 'xxscreeps/schema/index.js';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import { config, configPath } from 'xxscreeps/config/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { restoreLayout } from 'xxscreeps/schema/archive.js';
import { build as buildSchema } from 'xxscreeps/schema/build.js';
import { Builder } from 'xxscreeps/schema/index.js';
import { archiveStruct } from 'xxscreeps/schema/kaitai.js';
import { initializeView, makeViewReader } from 'xxscreeps/schema/read.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';

const archivePath = new URL(`${config.schemaArchive}/`, configPath);
const archivedReaders = new Map<number, Promise<(view: BufferView) => unknown>>();
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
export function build<Type extends Format>(format: Type, cache = new Map()) {
	const result = buildSchema(format, cache);
	const file = makeArchivePath(result.name, result.version);
	fsSync.mkdirSync(archivePath, { recursive: true });
	try {
		fsSync.statSync(file);
	} catch {
		fsSync.writeFileSync(file, result.archive);
		fsSync.writeFileSync(makeArchivePath(result.name, result.version, 'ksy'), archiveStruct(result.layout, result.version));
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
	return async (buffer: Readonly<Uint8Array>) => {
		const { view, version } = initializeView(buffer);
		if (expectedVersion === version) {
			return buffer;
		} else {
			const reader = await getOrSet(archivedReaders, version, async () => {
				const archive = await async function() {
					try {
						return await fs.readFile(makeArchivePath(name, version), 'utf8');
					} catch {
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
 * Generates module source text for `xxscreeps:packages`
 */
export function makePackagesModule() {
	const bundle = Fn.pipe(
		packages,
		$$ => Fn.map($$, ([ key, value ]) => [ key, { version: value.version } ] as const),
		Object.fromEntries,
		JSON.stringify);
	// Yes, double stringify into JSON.parse! JSON parsing at runtime is faster than JavaScript
	// parsing at compilation time.
	return `export default JSON.parse(${JSON.stringify(bundle)});`;
}
