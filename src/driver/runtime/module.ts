import type { CodePayload } from 'xxscreeps/engine/db/user/code';
import { loadSourceMap } from './source-map';

declare const globalThis: any;
export function makeRequire(modules: CodePayload, evaluate: (source: string, filename: string) => any) {

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
		const content = modules.get(name);
		if (content === undefined) {
			throw new Error(`Unknown module: ${name}`);
		}
		cache[name] = null;
		const exports = function() {
			if (typeof content === 'string') {
				// Compile string module and execute
				const module = {
					exports: {} as any,
				};
				const sourceName = `${name}.js`;

				loadSourceMap(sourceName, content);
				const moduleFunction = evaluate(`(function(module,exports){${content}\n})`, sourceName);
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
				return module.exports;
			} else {
				// Just return Uint8Array. This gives the player access to the whole payload, but it only
				// contains their content anyway so it's fine.
				return content;
			}
		}();

		// Cache executed module and release code string (maybe it frees memory?)
		cache[name] = exports;
		modules.delete(name);
		return exports;
	};
}
