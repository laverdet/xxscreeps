import './mods';
await async function() {
	// Get script and remove `dist/config/entry.js` from args
	process.argv.splice(1, 1);
	const specifier = process.argv[1];
	if (!specifier) {
		throw new Error('No script specified');
	}
	// Resolve with different pattern strategies
	const base = new URL('../..', import.meta.url);
	for (const fn of [
		str => str,
		str => str.replace(/^/, 'dist/').replace(/\.ts$/, ''),
		str => str.replace(/^src\//, 'dist/').replace(/\.ts$/, ''),
	] as ((str: string) => string)[]) {
		const module = await async function() {
			try {
				const path = `${new URL(fn(specifier), base)}`;
				// .ts files will resolve but fail to import
				if (!path.endsWith('.ts')) {
					return await import.meta.resolve(path);
				}
			} catch (err) {}
		}();
		if (module) {
			// Forward to script
			await import(module);
			return;
		}
	}
	throw new Error(`Cannot find module '${specifier}'`);
}();
