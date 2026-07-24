import type { Database } from 'xxscreeps/engine/db/database.js';
import type { Package } from 'xxscreeps/schema/build.js';
import type { BufferView, Format } from 'xxscreeps/schema/index.js';
import type { LayoutAndTraits } from 'xxscreeps/schema/layout.js';
import * as fs from 'node:fs/promises';
import { config, configPath } from 'xxscreeps/config/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { restoreLayout } from 'xxscreeps/schema/archive.js';
import { build as buildSchema } from 'xxscreeps/schema/build.js';
import { Builder } from 'xxscreeps/schema/index.js';
import { archiveStruct } from 'xxscreeps/schema/kaitai.js';
import { initializeView, makeViewReader } from 'xxscreeps/schema/read.js';

const packages = new Map<string, Package>();

const versionId = (version: number) => version.toString(16).padStart(8, '0').split(/(?<hex>[0-9a-f]{2})/).reverse().join('');
const schemaKeyFor = (name: string, version: number) => `schema/${name}/${versionId(version)}`;

/**
 * Builds a schema package from a format and retains the result which can be used later within the
 * player runtime.
 */
export function build<Type extends Format>(format: Type, cache = new Map<Format, LayoutAndTraits>()) {
	const result = buildSchema(format, cache);
	packages.set(result.name, result);
	return result;
}

/**
 * Save the currently load schema packages into the database, and maybe to the filesystem.
 */
export function saveSchemaArchives(database: Database) {
	return Fn.mapAwait(packages, async ([ name, info ]) => {
		const key = schemaKeyFor(name, info.version);
		if (info.archive !== '?') {
			await Promise.all([
				database.data.hSet(key, 'archive', info.archive),
				database.data.hSet(key, 'created', Date.now(), { if: 'NX' }),
				database.data.hSet(key, 'seen', Date.now()),
				async function() {
					const { schemaArchive } = config;
					if (schemaArchive !== undefined) {
						const archivePath = new URL(`${schemaArchive}/`, configPath);
						const js = new URL(`${name.toLowerCase()}-${versionId(info.version)}.js`, archivePath);
						const ksy = new URL(`${name.toLowerCase()}-${versionId(info.version)}.ksy`, archivePath);
						await fs.mkdir(archivePath, { recursive: true });
						try {
							await fs.stat(js);
						} catch {
							await fs.writeFile(js, info.archive);
							await fs.writeFile(ksy, archiveStruct(info.layout, info.version));
						}
					}
				}(),
			]);
			// Hacky: free up memory blob
			info.archive = '?';
		}
	});
}

/**
 * Creates a function which transparently upgrades a blob to a newer schema version by first reading
 * with the old schema and writing with the new one.
 */
export function makeUpgrader(info: Package, write: (value: any) => Readonly<Uint8Array>) {
	const { name, version: expectedVersion } = info;
	let load: Promise<(view: BufferView) => unknown> | undefined;
	return async (database: Database, buffer: Readonly<Uint8Array>) => {
		const { view, version } = initializeView(buffer);
		if (expectedVersion === version) {
			return buffer;
		} else {
			// Load archived reader from the database
			const reader = await (load ??= async function() {
				const key = schemaKeyFor(name, version);
				const archive = await database.data.hGet(key, 'archive');
				if (archive === null) {
					throw new Error(`No archived schema found for ${name} ${version}`);
				}
				await database.data.hSet(key, 'used', Date.now());
				const layout = restoreLayout(archive, info.layout);
				return makeViewReader({ layout, version }, new Builder({ materialize: true }));
			}());

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
