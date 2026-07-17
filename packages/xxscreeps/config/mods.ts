import type { Provide } from './loader.js';
import type { LoaderConfig } from './nodejs.js';
import * as fs from 'node:fs/promises';
import { register } from 'node:module';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolve } from '@loaderkit/resolve/esm';
import { defaultAsyncFileSystem } from '@loaderkit/resolve/fs';
import { initializationDefaults } from 'xxscreeps/config/config.js';
import rawConfig from 'xxscreeps/config/raw.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import 'xxscreeps/engine/service/signal.js';

/** Type of each mod's index.ts */
export interface Manifest {
	dependencies?: string[];
	provides: Provide | Provide[] | null;
	types?: { js: URL; name: string; ts: URL };
}

// Types for mod `index.ts` manifest
/** @internal */
export interface ResolvedMod {
	provides: Record<Provide, string>;
	types?: Manifest['types'];
	url: string;
}

// The location from which mods in .screepsrc.yaml will be resolved
const from = await async function() {
	// Mods are resolved from cwd unless there is no package.json here. In that case it's probably
	// Docker or `npm install -g xxscreeps`. Idk, this is messy.
	const cwd = pathToFileURL(process.cwd() + path.sep);
	try {
		await fs.stat(new URL('package.json', cwd));
		return cwd;
	} catch {
		return new URL(import.meta.url);
	}
}();

// Load mods from `.screepsrc.yaml`
/** @internal */
export const mods = await async function() {
	const mods: ResolvedMod[] = [];
	const stack: string[] = [];
	const resolved = new Set<string>();

	// Resolve module dependencies in a hopefully deterministic order
	const load = async (specifiers: string[]) => {
		const imports = await Fn.mapAwait(
			[ ...specifiers ].sort(),
			async specifier => {
				const { url } = await async function() {
					try {
						// First, import bare module specifier [@xxscreeps/redis]
						return await resolve(defaultAsyncFileSystem, specifier, from);
					} catch (suppressed) {
						try {
							// Second, try unnamed module exports [xxscreeps/mods/classic/chemistry]
							return await resolve(defaultAsyncFileSystem, `${specifier}/index.js`, from);
						} catch (error) {
							throw new SuppressedError(error, suppressed, `Failed to resolve mod '${specifier}'`);
						}
					}
				}();
				const { manifest } = await import(url.href) as { manifest: Manifest };
				return { manifest, specifier, url };
			},
		);
		for (const { manifest, specifier, url } of imports) {
			const { dependencies, provides, types } = manifest;
			if (resolved.has(specifier)) {
				continue;
			} else if (stack.includes(specifier)) {
				throw new Error(`Detected cyclic dependency: ${stack.join(' -> ')} -> ${specifier}`);
			} else {
				stack.push(specifier);
				await load(dependencies ?? []);
				stack.pop();
				// Resolve providers within one mod
				const providesSpecifiers = function() {
					if (Array.isArray(provides)) {
						return provides;
					} else {
						return provides === null ? [] : [ provides ];
					}
				}();

				const resolvedProvides = Fn.fromEntries(await Fn.mapAwait(
					providesSpecifiers,
					async (provide): Promise<[ Provide, string ]> => {
						// Mods can export providers either as, for example, 'game.ts' or 'game/index.ts'
						try {
							const resolution = await resolve(defaultAsyncFileSystem, `./${provide}/index.js`, url);
							return [ provide, resolution.url.href ];
						} catch (suppressed) {
							try {
								const resolution = await resolve(defaultAsyncFileSystem, `./${provide}.js`, url);
								return [ provide, resolution.url.href ];
							} catch (error) {
								throw new SuppressedError(error, suppressed, `Failed to resolve provider '${provide}' of mod '${specifier}'`);
							}
						}
					}));
				mods.push({
					provides: resolvedProvides,
					types,
					url: url.href,
				});
				resolved.add(specifier);
			}
		}
	};
	await load(rawConfig.mods ?? initializationDefaults.mods);
	return mods;
}();

// Register nodejs loader
const privateTransform = process.argv.indexOf('--private-transform=nodejs');
if (privateTransform !== -1) {
	process.argv.splice(privateTransform, 1);
}
const privateIsolatedTransform = process.argv.indexOf('--private-transform=isolated-vm');
if (privateIsolatedTransform !== -1) {
	process.argv.splice(privateIsolatedTransform, 1);
}
const data: LoaderConfig = {
	mods: mods.map(mod => ({ ...mod, types: undefined })),
	pathfinder:
	 rawConfig.runner?.sandbox === 'experimental'
	 	? '@xxscreeps/pathfinder/iv'
	 	: '@xxscreeps/pathfinder',
	...privateTransform !== -1 && {
		privateTransformBase: new URL('..', import.meta.url).href,
	},
	...privateIsolatedTransform !== -1 && {
		privateSymbolImplementation: 'xxscreeps/driver/private/symbol/isolated-vm.js',
		privateTransformBase: new URL('..', import.meta.url).href,
	},
};
register('./nodejs.js', import.meta.url, { data });

// Write 'xxscreeps/dist/config.json.schema'
const { schema } = await import('xxscreeps/config/index.js');
await fs.writeFile(new URL('../config.schema.json', import.meta.url), JSON.stringify(schema, null, '\t'));
