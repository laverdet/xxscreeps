// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../declarations.d.ts" />
import fs from 'fs/promises';
import { configDefaults } from 'xxscreeps/config/config';
import config, { configPath } from 'xxscreeps/config/raw';

type Provide = 'backend' | 'config' | 'constants' | 'driver' | 'game' | 'processor' | 'storage';
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
const baseUrl = configPath;
const version = 2;
async function resolve(specifiers: string[]) {
	const imports = await Promise.all([ ...specifiers ].sort().map(async specifier => {
		const url = await import.meta.resolve(specifier, `${baseUrl}`);
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
export { mods };

// Ensure module imports are up to date on the filesystem
try {
	const cached = await import(`${'./manifest.cached'}`);
	if (cached.json !== JSON.stringify(mods) || cached.version !== version) {
		throw new Error('Out of date');
	}
} catch (err) {
	// Given a specifier fragment this return all mods which export it
	const resolveWithinMods = async(specifier: string) => {
		const resolved = await Promise.all(mods.map(async({ provides, url }) => {
			if (provides.includes(specifier as never)) {
				return import.meta.resolve(`./${specifier}`, `${url}`);
			}
		}));
		return resolved.filter((mod): mod is string => mod !== undefined);
	};

	// Create output directory
	const outDir = new URL('../mods.resolved/', import.meta.url);
	try {
		await fs.mkdir(outDir);
	} catch (err) {
		if (err.code !== 'EEXIST') {
			throw err;
		}
	}

	// Save mod bundles
	await Promise.all([
		...[ 'backend', 'driver', 'game', 'processor', 'storage' ].map(async specifier => {
			const mods = await resolveWithinMods(specifier);
			const content = mods.map(mod => `import ${JSON.stringify(mod)};\n`).join('');
			await fs.writeFile(new URL(`${specifier}.js`, outDir), content, 'utf8');
		}),
		async function() {
			// Merge JSON schema
			const schemaOutput = new URL('config.schema.json', outDir);
			const inputs = [
				await import.meta.resolve('xxscreeps/config/config'),
				...await resolveWithinMods('config'),
			];
			const json = (await Promise.all(inputs.map(async path => {
				try {
					return JSON.parse(await fs.readFile(new URL('config.schema.json', path), 'utf8'));
				} catch (err) {}
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
		async function() {
			const mods = await resolveWithinMods('constants');
			const content = mods.map(mod => `export * from ${JSON.stringify(mod)};\n`).join('');
			await fs.writeFile(new URL('constants.js', outDir), content, 'utf8');
		}(),
	]);

	// Save mod inclusion manifest
	await fs.writeFile(
		new URL('./manifest.cached.js', import.meta.url), `
			export const json = ${JSON.stringify(JSON.stringify(mods))}
			export const version = ${version};\n`, 'utf8');
}
