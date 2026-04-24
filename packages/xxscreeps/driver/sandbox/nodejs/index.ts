import type { tick } from './runtime.js';
import type { Compiler, Evaluate } from 'xxscreeps/driver/runtime/index.js';
import type { Sandbox } from 'xxscreeps/driver/sandbox/index.js';
import type { InitializationPayload, TickPayload } from 'xxscreeps/engine/runner/index.js';
import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as vm from 'node:vm';
import { TransformOptions, transformSync } from '@babel/core';
import convertSourceMap from 'convert-source-map';
import Privates from 'xxscreeps/driver/private/transform.js';
import { makePackagesModule } from 'xxscreeps/engine/schema/build/index.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';

type Tick = typeof tick;
const defaultRequire = createRequire(import.meta.url);

function makeCachedData(module: vm.SourceTextModule): Buffer {
	// @ts-expect-error
	// eslint-disable-next-line @typescript-eslint/no-unsafe-call
	return module.createCachedData() as Buffer;
}

// Resolve specifier & referrer to canonical URL
const resolver = function() {
	const cache = new Map<string, string>();
	return (specifier: string, referrer?: string) => {
		const key = `${referrer ?? ''}::${specifier}`;
		switch (specifier) {
			case '@xxscreeps/pathfinder': return specifier;
			case 'xxscreeps/engine/schema/build/packages.js': return 'xxscreeps:packages';
			default: return getOrSet(cache, key, () => {
				const alias = function() {
					switch (specifier) {
						case 'tslib': return 'tslib/tslib.es6.mjs';
						case 'xxscreeps/config/mods/import/game.js': return 'xxscreeps/config/mods.static/game.js';
						case 'xxscreeps/driver/runtime/source-map.js': return 'xxscreeps/driver/sandbox/nodejs/source-map.js';
						case 'xxscreeps/engine/processor/index.js': throw new Error('processor required from runtime');
						case 'xxscreeps/engine/schema/build/index.js': return 'xxscreeps/engine/schema/build/runtime.js';
						default: return specifier;
					}
				}();
				if (alias.startsWith('.')) {
					return new URL(alias, referrer).href;
				} else {
					return import.meta.resolve(alias, referrer);
				}
			});
		}
	};
}();

// General filesystem-backed source text module loader
const loader = function() {
	interface ModuleSourceTextRecord {
		cachedData: Buffer;
		sourceText: string;
	}
	const cache = new Map<string, ModuleSourceTextRecord>();
	return async (context: vm.Context, url: string) => {
		const cached = cache.get(url);
		if (cached) {
			return new vm.SourceTextModule(cached.sourceText, {
				cachedData: cached.cachedData,
				context,
				identifier: url,
			});
		} else {
			const xxPath = new URL('../../..', import.meta.url).href;
			const sourceText = await async function() {
				if (url.startsWith(xxPath)) {
					// Load file & source map
					const [ sourceText, sourceMap ] = await Promise.all([
						fs.readFile(new URL(url), 'utf8'),
						async function() {
							// 'xxscreeps/config/mods.static/game.js' has no map
							try {
								const source = await fs.readFile(new URL(`${url}.map`), 'utf8');
								return JSON.parse(source) as TransformOptions['inputSourceMap'];
							} catch {}
						}(),
					]);

					// Parse, transform & generate
					const result = function() {
						try {
							const result = transformSync(sourceText, {
								babelrc: false,
								configFile: false,
								filename: url,
								inputSourceMap: sourceMap,
								plugins: [ Privates ],
								retainLines: true,
								sourceMaps: true,
								sourceType: 'module',
							});
							assert.ok(result);
							return result;
						} finally {
							// nb: Babel has uncharacteristically poor hygiene here and assigns `Error.prepareStackTrace`
							// when you invoke `parse` and doesn't even bother to put it back. This causes nodejs's source
							// map feature to bail out and show plain source files.
							// https://github.com/babel/babel/blob/74b5ac21d0fb516ecc8d8375cc75b4446b6c9735/packages/babel-core/src/errors/rewrite-stack-trace.ts#L140
							// @ts-expect-error
							delete Error.prepareStackTrace;
						}
					}();

					// Build final module source
					assert.ok(result.code != null);
					assert.ok(result.map);
					const lastLine = result.code.lastIndexOf('\n');
					assert.ok(lastLine !== -1);
					const plainSourceText = result.code.slice(0, lastLine + 1) + convertSourceMap.removeMapFileComments(result.code.slice(lastLine + 1));
					const sourceMapComment = convertSourceMap.fromObject(result.map).toComment();
					// TODO: I'm not sure source maps are actually working. Line numbers look correct, but I
					// think that's from the `retainLines` option above. Additionally, it would be nice to
					// split source map blobs from the source text to keep this out of the main source text.
					return `${plainSourceText}\n${sourceMapComment}\n`;
				} else {
					return fs.readFile(new URL(url), 'utf8');
				}
			}();
			const module = new vm.SourceTextModule(sourceText, {
				context,
				identifier: url,
			});
			const cachedData = makeCachedData(module);
			cache.set(url, { cachedData, sourceText });
			return module;
		}
	};
}();

// Loaders which smuggle host modules into vm context
const hostLoaders = await async function() {
	const make = async (specifier: string) => {
		const identifier = `delegate:${specifier}`;
		const hostModule = await import(specifier) as object;
		const names = Object.keys(hostModule);
		const importsAssignments = Fn.map(names, (name, ii) => `const import${ii} = module[${JSON.stringify(name)}];`);
		const importsExports = Fn.map(names, (name, ii) => `import${ii} as ${JSON.stringify(name)}`);
		const sourceText =
			`const module = await import(${JSON.stringify(specifier)});
			${Fn.join(importsAssignments, '\n')}
			export { ${Fn.join(importsExports, ', ')} };`;
		let cachedData: Buffer | undefined;
		const importModuleDynamically = (request: string): vm.SourceTextModule => {
			if (request === specifier) {
				return hostModule as unknown as vm.SourceTextModule;
			} else {
				throw new Error(`Unexpected dynamic import of '${request}'`);
			}
		};
		return (context: vm.Context) => {
			if (cachedData) {
				return new vm.SourceTextModule(sourceText, {
					cachedData,
					context,
					identifier,
					importModuleDynamically,
				});
			} else {
				const module = new vm.SourceTextModule(sourceText, {
					context,
					identifier,
					importModuleDynamically,
				});
				cachedData = makeCachedData(module);
				return module;
			}
		};
	};
	const [ pathfinder, process, util ] = await Promise.all([
		make('@xxscreeps/pathfinder'),
		make('node:process'),
		make('node:util'),
	]);
	return {
		'@xxscreeps/pathfinder': pathfinder,
		'node:process': process,
		'node:util': util,
	};
}();

// Loader for 'xxscreeps/engine/schema/build/packages.js'
const packageLoader = function() {
	let cachedData: Buffer | undefined;
	const identifier = 'xxscreeps:packages';
	const sourceText = makePackagesModule();
	return (context: vm.Context) => {
		if (cachedData) {
			return new vm.SourceTextModule(sourceText, { cachedData, context, identifier });
		} else {
			const module = new vm.SourceTextModule(sourceText, { context, identifier });
			cachedData = makeCachedData(module);
			return module;
		}
	};
}();

export class NodejsSandbox implements Sandbox {
	private readonly context;
	private tick?: Tick;

	constructor() {
		this.context = vm.createContext();
	}

	createInspectorSession(): never {
		throw new Error('Inspector not supported with `sandbox: unsafe`');
	}

	dispose() {}

	async initialize(data: InitializationPayload) {

		// Initialize vm context, set up globals
		const { context } = this;
		context.global = context;

		// Evaluation delegate
		const evaluate: Evaluate = (source, filename) => new vm.Script(source, { filename }).runInContext(context);

		// Load & link game runtime modules
		const runtime = await async function() {
			const module = new vm.SourceTextModule(
				'export * from "xxscreeps/driver/sandbox/nodejs/runtime.js";',
				{
					context,
					identifier: 'xxscreeps:runtime',
				},
			);
			const resolutions = new Map<string, Promise<vm.Module>>();
			await module.link(async (specifier, referencingModule) => {
				const url = resolver(specifier, referencingModule.identifier);
				return getOrSet(resolutions, url, async () => {
					switch (url) {
						case '@xxscreeps/pathfinder':
						case 'node:process':
						case 'node:util':
							return hostLoaders[url](context);
						case 'xxscreeps:packages':
							return packageLoader(context);
						default:
							return loader(context, url);
					}
				});
			});
			await module.evaluate(context);
			return module.namespace as unknown as typeof import('./runtime.js');
		}();

		// Invoke runtime initializer
		const compiler: Compiler<vm.SourceTextModule> = {
			// `vm` module only support async operation
			compile() { throw new Error('Modules are not supported within `sandbox: unsafe`'); },
			evaluate() { throw new Error(); },
		};
		runtime.initialize(defaultRequire, compiler, evaluate, data);

		// Setup tick function
		type MakeTick = (context: vm.Context, ns: typeof runtime, runInContext: unknown) => Tick;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const makeTick: MakeTick = vm.runInContext(
			`(function(context, ns, runInContext) {
				const { tick } = ns;
				let data;
				_runWithArgs = function() {
					try {
						return tick(data);
					} finally {
						data = undefined;
					}
				};

				return function(data_) {
					data = data_;
					return runInContext('_runWithArgs()', context, { timeout: data.cpu.tickLimit });
				};
			})`,
			context);
		this.tick = makeTick(context, runtime, vm.runInContext);
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async run(data: TickPayload) {
		const start = process.hrtime.bigint();
		try {
			const payload = this.tick!(data);
			if (payload.error) {
				return { result: 'error' as const, console: payload.console };
			}
			payload.usage.cpu = Number(process.hrtime.bigint() - start) / 1e6;
			return { result: 'success' as const, payload };
		} catch (err: any) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			if (err.message.startsWith('Script execution timed out after')) {
				return { result: 'timedOut' as const };
			}
			throw err;
		}
	}
}
