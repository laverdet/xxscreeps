// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../declarations.d.ts" />
import { promises as fs } from 'fs';
import config, { configPath } from 'xxscreeps/config';

type Provide = 'constants' | 'backend' | 'driver' | 'game' | 'processor' | 'storage';
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
await resolve(config.mods);
export { mods };

// Ensure module imports are up to date on the filesystem
try {
	const compiled = await import(`${'./manifest.compiled'}`);
	if (compiled.json !== JSON.stringify(mods)) {
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
		return resolved.filter(mod => mod !== undefined);
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
			const mods = await resolveWithinMods('constants');
			const content = mods.map(mod => `export * from ${JSON.stringify(mod)};\n`).join('');
			await fs.writeFile(new URL('constants.js', outDir), content, 'utf8');
		}(),
	]);

	// Save mod inclusion manifest
	await fs.writeFile(
		new URL('./manifest.compiled.js', import.meta.url),
		`export const json = ${JSON.stringify(JSON.stringify(mods))};\n`, 'utf8');
}
