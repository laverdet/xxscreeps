// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../declarations.d.ts" />
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { defaults } from 'xxscreeps/config/defaults';
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
await resolve(config.mods ?? defaults.mods);
export { mods };

// Ensure module imports are up to date on the filesystem
try {
	const compiled = await import(`${'./manifest.compiled'}`);
	if (compiled.json !== JSON.stringify(mods)) {
		throw new Error('Out of date');
	}
} catch (err) {
	// Given a specifier fragment this return all mods which export it
	console.log('Regenerating mod manifest...');
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
			const typesOutput = new URL('config.ts', outDir);
			const schemaOutput = new URL('config.schema.json', outDir);

			// These will be the resolved .js files, but we need to convert back to .ts paths.
			const compiled = [
				await import.meta.resolve('xxscreeps/config/schema'),
				...await resolveWithinMods('config'),
			];
			const sources = compiled.map(path => {
				// These are file:// URLs, so no need to worry about platform separator
				const indexOf = path.lastIndexOf('/dist/');
				if (indexOf === -1) {
					throw new Error(`Did not find 'dist' in '${path}'`);
				}
				return fileURLToPath(path.substr(0, indexOf) + '/src/' + path.substr(indexOf + 6)).replace(/\.js$/, '');
			});
			// Combine them into one type
			const content =
				sources.map((mod, ii) => `import { Schema as Schema${ii} } from ${JSON.stringify(mod)};\n`).join('') +
				`export type Schema = ${sources.map((mod, ii) => `Schema${ii}`).join(' & ')};\n`;
			await fs.writeFile(typesOutput, content, 'utf8');
			try {
				await promisify(execFile)('npx', [
					'typescript-json-schema',
					'--include', fileURLToPath(typesOutput),
					'--defaultProps',
					'--required',
					'tsconfig.json',
					'Schema',
					'-o', fileURLToPath(schemaOutput),
				]);
			} catch (err) {
				try {
					await fs.unlink(schemaOutput);
				} catch (err) {}
			}
		}(),
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
