import type { KeyValProvider } from 'xxscreeps/engine/db/storage/provider.js';
import type { Package } from 'xxscreeps/schema/build.js';
import type { BufferView, Format } from 'xxscreeps/schema/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { restoreLayout } from 'xxscreeps/schema/archive.js';
import { build as buildSchema } from 'xxscreeps/schema/build.js';
import { Builder } from 'xxscreeps/schema/index.js';
import { initializeView, makeViewReader } from 'xxscreeps/schema/read.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';

const archivedSchemas = new Map<string, string>();
const archivedReaders = new Map<string, (view: BufferView) => any>();
const packages = new Map<string, Package>();

function archiveId(name: string, version: number | string) {
	return `${name}#${version}`;
}

function schemaKey(name: string) {
	return `schema/${name.toLowerCase()}`;
}

/**
 * Builds a schema package from a format and retains the result which can be used later within the
 * player runtime.
 */
export function build<Type extends Format>(format: Type, cache = new Map()) {
	const result = buildSchema(format, cache);
	packages.set(result.name, result);
	archivedSchemas.set(archiveId(result.name, result.version), result.archive);
	return result;
}

/**
 * Synchronizes schema archives with the given keyval provider. Archives of previous schema
 * versions are loaded into memory for use by `makeUpgrader`, and the current version of each
 * package is stored if it's not already known. This runs when connecting to a database or shard so
 * that every persistent store carries the schemas needed to read its own blobs.
 */
export async function initializeSchemaArchive(keyval: KeyValProvider) {
	await Promise.all(Fn.map(packages.values(), async info => {
		const key = schemaKey(info.name);
		const archived = await keyval.hGetAll(key);
		for (const [ version, archive ] of Object.entries(archived)) {
			archivedSchemas.set(archiveId(info.name, version), archive);
		}
		if (info.archive !== '?' && !(info.version in archived)) {
			await keyval.hSet(key, `${info.version}`, info.archive, { if: 'NX' });
		}
	}));
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
			const reader = getOrSet(archivedReaders, archiveId(name, version), () => {
				const archive = archivedSchemas.get(archiveId(name, version));
				if (archive === undefined) {
					throw new Error(`No archived schema found for ${name} ${version}`);
				}
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
