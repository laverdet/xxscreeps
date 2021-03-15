import { promises as fs } from 'fs';
import config from 'xxscreeps/config';

export type Manifest = {
	dependencies?: string[];
};

// Resolve module dependencies in a hopefully deterministic order
const modsInOrder: string[] = [];
const stack: string[] = [];
const resolved = new Set<string>();
async function resolve(specifiers: string[]) {
	const imports = await Promise.all([ ...specifiers ].sort().map(
		async specifier => ({
			module: (await import(specifier)).manifest as Manifest,
			specifier,
		})));
	for (const { module, specifier } of imports) {
		if (resolved.has(specifier)) {
			continue;
		} else if (stack.includes(specifier)) {
			throw new Error(`Detected cyclic dependency: ${stack.join(' -> ')} -> ${specifier}`);
		} else {
			stack.push(specifier);
			await resolve(module.dependencies ?? []);
			stack.pop();
			modsInOrder.push(specifier);
			resolved.add(specifier);
		}
	}
}
await resolve(config.mods);

// Ensure module imports are up to date on the filesystem
try {
	const compiled = await import(`${'./manifest.compiled'}`);
	if (compiled.json !== JSON.stringify(modsInOrder)) {
		throw new Error('Out of date');
	}
} catch (err) {
	// Resolve mod specifier to URL
	const modPaths = await Promise.all(modsInOrder.map(mod => import.meta.resolve(mod)));

	// Given a specifier fragment this return all mods which export it
	const resolveWithinMods = async(specifier: string) => {
		const resolved = await Promise.all(modPaths.map(async mod => {
			try {
				return await import.meta.resolve(`./${specifier}`, mod);
			} catch (err) {
				if (err.code !== 'ERR_MODULE_NOT_FOUND') {
					throw err;
				}
			}
		}));
		return resolved.filter(mod => mod !== undefined);
	};

	// Create output directory
	const outDir = new URL('./import.resolved/', import.meta.url);
	try {
		await fs.mkdir(outDir);
	} catch (err) {
		if (err.code !== 'EEXIST') {
			throw err;
		}
	}

	// Save mod bundles
	await Promise.all([
		...[ 'backend', 'game', 'processor' ].map(async specifier => {
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
		`export const json = ${JSON.stringify(JSON.stringify(modsInOrder))};\n`, 'utf8');

	// Try again!
	console.error('Mod configuration is out of date. Process must be restarted.');
	process.exit(1);
}
