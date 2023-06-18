import type { Compiler, Evaluate } from 'xxscreeps/driver/runtime/index.js';
import type { CodePayload } from 'xxscreeps/engine/db/user/code.js';
import { WASI } from './wasi/index.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';
import { loadSourceMap } from './source-map.js';

type Loader<Source> = {
	resolve(specifier: string, referrer?: string): string;
	compile(url: string): Source | undefined;
};

export function makeEnvironment(modules: CodePayload, evaluate: Evaluate, compiler: Compiler) {
	const main = [ 'main.js', 'main.mjs', 'main.wasm', 'main' ].find(entry => modules.has(entry));
	if (main === 'main' || main == 'main.js') {
		// Use flat CommonJS loader
		const require = makeRequire(evaluate, {
			resolve(specifier) {
				// Allow require('./module.js')
				const basename = specifier.replace(/^\.\//, '');
				// Allow require('module')
				const withJs = `${basename}.js`
				return modules.has(withJs) ? withJs : basename
			},
			compile(url) {
				return modules.get(url);
			},
		});
		globalThis.require = require as never;
		return () => require('main');

	} else if (main) {
		// Use ES Module loader
		const importModule = makeModule(compiler, {
			// Simple URL-style resolver function
			resolve(specifier, referrer) {
				const resolved = function() {
					if (specifier.startsWith('/')) {
						return specifier;
					} else if (
						referrer &&
						(specifier.startsWith('./') || specifier.startsWith('../'))
					) {
						return `${referrer.replace(/[#?].*$/, '')}/../${specifier}`;
					} else {
						return specifier;
					}
				}();
				const [ path, extra ] = splitLocator(resolved);
				return path
					// Turns `foo/./bar` into `foo/bar`
					.replaceAll('/./', '/')
					// Turns `foo/../bar` into `bar`
					.replace(/[^/]+\/\.\.\//g, '')
					// Turns `foo//bar` into `foo/bar`
					.replace(/\/\/+/g, '/') +
					// Adds #hash and/or ?query back
					extra;
			},

			// Fetch source for a given URL
			compile(url: string) {
				const [ path, extra ] = splitLocator(url);
				switch (path) {
					case 'screeps:holder':
						return compiler.compile(`
							let ii = 0;
							const holder = new Map;
							export function set(value) {
								const key = ++ii;
								holder.set(key, value);
								return ii;
							}
							export default function(key) {
								const value = holder.get(key);
								holder.delete(key);
								return value;
							};
						`, url);

					case 'wasi_snapshot_preview1': {
						// Parse query parameters into environment
						const [ referrerPath, referrerExtra ] = splitLocator(extra.substr(1));
						const env: Record<string, string> = {};
						const query = /\?(?<query>[^#]+)/.exec(referrerExtra)?.groups!.query;
						for (const pair of query?.split('&') ?? []) {
							const ii = pair.indexOf('=');
							if (ii === -1) {
								env[decodeURIComponent(pair)] = '';
							} else {
								env[decodeURIComponent(pair.substr(0, ii))] = decodeURIComponent(pair.substr(ii + 1));
							}
						}

						// Instantiated per WebAssembly instance
						const wasi = new WASI(referrerPath, env);
						return compiler.compile(`
							import holder from 'screeps:holder';
							const wasi = holder(${holder(wasi)});
							export const { ${[ ...Object.getOwnPropertyNames(wasi) ].join(', ')} } = wasi;
						`, url);
					}

					default:
						if (path.startsWith('/')) {
							const content = modules.get(path.substr(1));
							if (!content) {
								return;
							}
							// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
							switch (/\.[^.]+$/.exec(path)?.[0]) {
								case '.js':
								case '.mjs':
									loadSourceMap(url, content as string);
									return compiler.compile(content as string, url);

								case '.json':
									return compiler.compile(`
										import holder from 'screeps:holder';
										export default JSON.parse(holder(${holder(content)}));
									`, url);

								case '.wasm': {
									// We want an instance of WASI for each WebAssembly instance
									const wasiSpecifier = `wasi_snapshot_preview1#${url}`;
									const wasm = new WebAssembly.Module(content as Uint8Array);

									// Resolve modules and create import declarations. The imports are created with a
									// boring `import{N}` naming scheme because WASM could conceivably import two
									// symbols from different modules which both share the same name.
									let ii = 0;
									let hasMemoryGrowth = false;
									const declarations = new Map<string, string[]>();
									const imports = new Map<string, string[]>();
									for (const internal of WebAssembly.Module.imports(wasm)) {
										// Resolve requested module to actual module
										const external = function() {
											const { module, name } = internal;
											if (module === 'env') {
												if (name === 'emscripten_notify_memory_growth') {
													// This implemented inline as a synchronous event emitter
													hasMemoryGrowth = true;
												} else if (name === 'getentropy') {
													// emcc 2.0.22 doesn't link against WASI for entropy
													return { module: wasiSpecifier, name: 'random_get' };
												} else {
													// This would throw an error later in the instantiation pipeline, but this
													// one is easier to understand.
													throw new Error(`Unresolved 'env' import: '${name}'`);
												}
											} else if (module === 'wasi_snapshot_preview1') {
												return { module: wasiSpecifier, name };
											} else {
												return { module: `${module}#${url}`, name };
											}
										}();
										if (!external) {
											continue;
										}

										// Save module import & WebAssembly env information
										const symbol = `$import${++ii}`;
										getOrSet(declarations, external.module, () => [ `$import${++ii}` ]).push(`${external.name} as ${symbol}`);
										getOrSet(imports, internal.module, () => []).push(`${JSON.stringify(internal.name)}: ${symbol}`);
									}

									// Build import & env strings
									const importDeclarations = [ ...declarations ].map(([ module, [ wildcard, ...pairs ] ]) => `
										import { ${pairs.join(', ')} } from ${JSON.stringify(module)};
										import * as ${wildcard} from ${JSON.stringify(module)};
										`).join('');
									const envString = `{ ${[ ...imports ].map(([ module, pairs ]) =>
										`${JSON.stringify(module)}: { ${pairs.join(', ')} }`).join(', ')} }`;

									// Render module code string. A non-standard notification is added to the `memory`
									// export. See the conversations below:
									// https://github.com/WebAssembly/WASI/issues/82
									// https://github.com/WebAssembly/design/issues/1296
									// https://v8.dev/blog/emscripten-standalone-wasm
									const exports = WebAssembly.Module.exports(wasm).map(({ name }) => name);
									const source = `
										${importDeclarations}
										import $holder from 'screeps:holder';
										export const { ${exports.join(', ')} } = function() {
											const env = ${envString};
											const listeners = [];
											if (${hasMemoryGrowth}) {
												(env.env ??= {}).emscripten_notify_memory_growth = () => listeners.forEach(fn => fn());
											}
											const instance = new WebAssembly.Instance($holder(${holder(wasm)}), env);
											if (instance.exports.memory && ${hasMemoryGrowth}) {
												instance.exports.memory.addGrowCallback = fn => listeners.push(fn);
											}
											for (const module of [${[ ...declarations ].map(entry => entry[1][0]).join(', ')}]) {
												module.initialize?.(instance);
											}
											instance.exports._initialize?.();
											return instance.exports;
										}();`;
									return compiler.compile(source, url);
								}
							}
						}
				}
			},
		});

		// Grab reference to holder, for use in source translators
		const holder = (value: any): any => importModule('screeps:holder').set(value);
		return () => importModule(modules.has('main.js') ? '/main.js' : '/main.mjs');

	} else {
		// No main defined
		return () => { throw new Error('Cannot find module \'main\'') };
	}
}

function splitLocator(url: string): [ string, string ] {
	const hash = url.indexOf('#');
	const query = url.indexOf('?');
	const pivot = Math.min(hash === -1 ? Infinity : hash, query === -1 ? Infinity : query);
	if (pivot === Infinity) {
		return [ url, '' ];
	} else {
		return [ url.substr(0, pivot), url.substr(pivot) ];
	}
}

function makeRequire(evaluate: Evaluate, loader: Loader<any>) {

	// Create `require` factory
	const cache = new Map<string, null | { error?: any; exports?: any }>();
	const requireFrom = (referrer?: string) => (specifier: string) => {
		// Resolve and check for existing or pending module
		const url = loader.resolve(specifier, referrer);
		const cached = cache.get(url);
		if (cached !== undefined) {
			if (cached === null) {
				throw new Error(`Circular reference to module: ${specifier}`);
			} else if (cached.error) {
				throw cached.error;
			}
			return cached.exports;
		}
		const content = loader.compile(url);
		if (content === undefined) {
			throw new Error(`Cannot find module '${specifier}' imported from '${referrer}'`);
		}
		cache.set(url, null);
		const exports = function() {
			if (typeof content === 'string') {
				// Compile string module and execute
				const module = {
					exports: {} as any,
				};
				const run = function() {
					try {
						const moduleFunction = evaluate(`(function(require,module,exports){${content}\n})`, url);
						const run = () => moduleFunction.apply(module, [ requireFrom(url), module, module.exports ]);
						run();
						return run;
					} catch (error) {
						cache.set(url, { error });
						throw error;
					}
				}();
				if (url === 'main' && module.exports.loop === undefined) {
					// If user doesn't have `loop` it means the first tick already run. Simulate a proper `loop`
					// method which runs the second time this is called.
					module.exports.loop = run;
				}
				return module.exports;
			} else {
				// Just return Uint8Array. This gives the player access to the whole payload, but it only
				// contains their content anyway so it's fine.
				return content;
			}
		}();

		// Cache executed module and release code string (maybe it frees memory?)
		cache.set(url, { exports });
		return exports;
	};
	return requireFrom();
}

export function makeModule<Module>(compiler: Compiler<Module>, loader: Loader<Module>) {

	// Create linker
	const cache = new Map<string, Module>();
	const linker = (specifier: string, referrer?: string) => {
		// Resolve and check for existing module
		const url = loader.resolve(specifier, referrer);
		const existing = cache.get(url);
		if (existing) {
			return existing;
		}
		// Compile and return
		const module = loader.compile(url);
		if (module === undefined) {
			throw new Error(`Cannot find module '${specifier}' imported from '${referrer}'`);
		}
		cache.set(url, module);
		return module;
	};

	// Return instantiate + evaluation
	const namespaces = new Map<string, {
		error: boolean;
		value: any;
	}>();
	return (specifier: string) => {
		const result = getOrSet(namespaces, specifier, () => {
			try {
				return { error: false, value: compiler.evaluate(linker(specifier), linker) };
			} catch (err) {
				return { error: true, value: err };
			}
		});
		if (result.error) {
			throw result.value;
		} else {
			return result.value;
		}
	};
}
