// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../declarations.d.ts" />
import fs from 'node:fs/promises';
import { configDefaults } from 'xxscreeps/config/config.js';
import config from 'xxscreeps/config/raw.js';

type Provide = 'backend' | 'config' | 'constants' | 'driver' | 'game' | 'processor' | 'storage' | 'test';
export type Manifest = {
	dependencies?: string[];
	provides: Provide | Provide[] | null;
};

// Resolve module dependencies in a hopefully deterministic order
const mods: {
	provides: Provide[];
	url: URL;
}[] = [];
const stack: string[] = [];
const resolved = new Set<string>();
const version = 5;
async function resolve(specifiers: string[]) {
	const imports = await Promise.all([ ...specifiers ].sort().map(async specifier => {
		// Node 24 ignores the second argument to import.meta.resolve, so bare
		// specifiers always resolve from *this* file's package scope. That
		// happens to work for built-in xxscreeps/* mods but would break for
		// third-party mods installed outside this package tree.
		const url = await async function() {
			try {
				return import.meta.resolve(`${specifier}/index.js`);
			} catch {
				try {
					return import.meta.resolve(`${specifier}.js`);
				} catch {
					return import.meta.resolve(specifier);
				}
			}
		}();
		return {
			manifest: (await import(url)).manifest as Manifest,
			specifier,
			url,
		};
	}));
	for (const { manifest, specifier, url } of imports) {
		if (resolved.has(specifier)) {
			continue;
		} else if (stack.includes(specifier)) {
			throw new Error(`Detected cyclic dependency: ${stack.join(' -> ')} -> ${specifier}`);
		} else {
			stack.push(specifier);
			await resolve(manifest.dependencies ?? []);
			stack.pop();
			mods.push({
				provides: Array.isArray(manifest.provides) ? manifest.provides :
				manifest.provides === null ? [] as never : [ manifest.provides ],
				url: new URL(url),
			});
			resolved.add(specifier);
		}
	}
}
await resolve(config.mods ?? configDefaults.mods);

// Ensure module imports are up to date on the filesystem
const cached = await async function() {
	try {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-template-expression
		return await import(`${'./manifest.cached'}`) as {
			json: string;
			version: number;
		};
	} catch {}
}();
if (cached?.json !== JSON.stringify(mods) || cached.version !== version) {
	// Given a specifier fragment this return all mods which export it.
	// Uses new URL() instead of import.meta.resolve because these are
	// relative paths against each mod's URL — import.meta.resolve's
	// second argument is ignored on Node 24.
	const resolveWithinMods = async (specifier: string) => {
		const resolved = await Promise.all(mods.map(async ({ provides, url }) => {
			if (provides.includes(specifier as never)) {
				const primary = new URL(`./${specifier}.js`, url);
				try {
					await fs.access(primary);
					return `${primary}`;
				} catch {
					return `${new URL(`./${specifier}/index.js`, url)}`;
				}
			}
		}));
		return resolved.filter((mod): mod is string => mod !== undefined);
	};

	// Create output directory
	const outDir = new URL('../mods.static/', import.meta.url);
	try {
		await fs.mkdir(outDir);
	} catch (err: any) {
		if (err.code !== 'EEXIST') {
			throw err;
		}
	}

	// Save mod bundles
	await Promise.all([
		async function() {
			const mods = await resolveWithinMods('constants');
			const content = mods.map(mod => `export * from ${JSON.stringify(mod)};\n`).join('');
			await fs.writeFile(new URL('constants.js', outDir), content, 'utf8');
		}(),
		async function() {
			const mods = await resolveWithinMods('game');
			const content = mods.map(mod => `import ${JSON.stringify(mod)};\n`).join('');
			await fs.writeFile(new URL('game.js', outDir), content, 'utf8');
		}(),
		async function() {
			// Merge JSON schema
			const schemaOutput = new URL('config.schema.json', outDir);
			const inputs = [
				import.meta.resolve('xxscreeps/config/config.js'),
				...await resolveWithinMods('config'),
			];
			const json = (await Promise.all(inputs.map(async path => {
				try {
					return JSON.parse(await fs.readFile(new URL('config.schema.json', path), 'utf8'));
				} catch {}
			}))).filter(content => content);
			const merged = {
				$schema: json[0].$schema,
				allOf: json.map(content => ({
					...content,
					$schema: undefined,
				})),
			};
			await fs.writeFile(schemaOutput, JSON.stringify(merged), 'utf8');

			// Write JS file
			const content =
				inputs.map((mod, ii) =>
					`import * as Config${ii} from ${JSON.stringify(mod)};\n`).join('') +
				`export default [ ${inputs.map((mod, ii) => `Config${ii}`).join(', ')} ];\n`;
			await fs.writeFile(new URL('config.js', outDir), content, 'utf8');
		}(),
	]);

	// Save mod inclusion manifest
	await fs.writeFile(
		new URL('./manifest.cached.js', import.meta.url), `
			export const json = ${JSON.stringify(JSON.stringify(mods))}
			export const version = ${version};\n`, 'utf8');
}

export { mods };
export async function importMods(provides: Provide) {
	for (const mod of mods) {
		if (mod.provides.includes(provides)) {
			try {
				await import(new URL(`./${provides}.js`, mod.url).href);
			} catch (e) {
				await import(new URL(`./${provides}/index.js`, mod.url).href);
			}
		}
	}
}
