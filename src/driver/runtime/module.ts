import { loadSourceMap } from './source-map';

declare const globalThis: any;
export function makeRequire(modules: Map<string, string>, evaluate: (source: string, filename: string) => any) {

	// Set up global `require`
	const cache = Object.create(null);
	return globalThis.require = (fullName: string) => {
		// Allow require('./module')
		const name = fullName.replace(/^\.\//, '');
		// Check cache
		const cached = cache[name];
		if (cached !== undefined) {
			if (cached === null) {
				throw new Error(`Circular reference to module: ${name}`);
			}
			return cached;
		}
		const code = modules.get(name);
		if (code === undefined) {
			throw new Error(`Unknown module: ${name}`);
		}
		cache[name] = null;
		// Compile module and execute
		const module = {
			exports: {} as any,
		};
		const sourceName = `${name}.js`;
		loadSourceMap(sourceName, code);
		const moduleFunction = evaluate(`(function(module,exports){${code}\n})`, sourceName);
		const run = () => moduleFunction.apply(module, [ module, module.exports ]);
		try {
			run();
		} catch (err) {
			Object.defineProperty(cache, name, { get: () => { throw err } });
			throw err;
		}
		if (name === 'main' && module.exports.loop === undefined) {
			// If user doesn't have `loop` it means the first tick already run. Simulate a proper `loop`
			// method which runs the second time this is called.
			const loop = () => run();
			module.exports.loop = () => module.exports.loop = loop;
		}
		// Cache executed module and release code string (maybe it frees memory?)
		cache[name] = module.exports;
		modules.delete(name);
		return module.exports;
	};
}
