import type { tick } from './runtime.js';
import type { Compiler, Evaluate } from 'xxscreeps/driver/runtime/index.js';
import type { Sandbox, TickCompletion } from 'xxscreeps/driver/sandbox/index.js';
import type { InitializationPayload, TickPayload } from 'xxscreeps/engine/runner/index.js';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as process from 'node:process';
import * as vm from 'node:vm';
import { resolve } from '@loaderkit/resolve/esm';
import { defaultAsyncFileSystem } from '@loaderkit/resolve/fs';
import { makeModSourceText } from 'xxscreeps/config/loader.js';
import { mods } from 'xxscreeps/config/mods.js';
import { privateTransformLoader } from 'xxscreeps/driver/private/transform.js';
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
	const cache = new Map<string, Promise<string>>();
	return (specifier: string, referrer?: string) => {
		const key = `${referrer ?? ''}::${specifier}`;
		switch (specifier) {
			case '@xxscreeps/pathfinder': return '@xxscreeps/pathfinder';
			case 'xxscreeps:mods/constants': return 'xxscreeps:mods/constants';
			case 'xxscreeps:mods/game': return 'xxscreeps:mods/game';
			case 'xxscreeps:packages': return 'xxscreeps:packages';
			default: return getOrSet(cache, key, async () => {
				const alias = function() {
					switch (specifier) {
						case 'tslib': return 'tslib/tslib.es6.mjs';
						case 'xxscreeps:private-symbol': return 'xxscreeps/driver/private/symbol/unsafe.js';
						case 'xxscreeps/driver/runtime/source-map.js': return 'xxscreeps/driver/sandbox/nodejs/source-map.js';
						case 'xxscreeps/engine/processor/index.js': throw new Error('processor required from runtime');
						case 'xxscreeps/engine/schema/build/index.js': return 'xxscreeps/engine/schema/build/runtime.js';
						default: return specifier;
					}
				}();
				const resolveReferrer = referrer?.startsWith('xxscreeps:') ? import.meta.url : referrer;
				const { url } = await resolve(defaultAsyncFileSystem, alias, new URL(resolveReferrer ?? import.meta.url));
				return url.href;
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
				if (url.startsWith('xxscreeps:')) {
					switch (url) {
						case 'xxscreeps:mods/constants': return makeModSourceText(mods, 'constants');
						case 'xxscreeps:mods/game': return makeModSourceText(mods, 'game');
						case 'xxscreeps:mods/schema': return makeModSourceText(mods, 'schema');
						case 'xxscreeps:packages': return makePackagesModule();
						default: throw new Error(`Unknown virtual module: ${url}`);
					}
				} else if (url.startsWith(xxPath)) {
					return privateTransformLoader(url);
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
	const [ pathfinder, assert, process, util ] = await Promise.all([
		make('@xxscreeps/pathfinder'),
		make('node:assert/strict'),
		make('node:process'),
		make('node:util'),
	]);
	return {
		'@xxscreeps/pathfinder': pathfinder,
		'node:assert/strict': assert,
		'node:process': process,
		'node:util': util,
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

	dispose(): undefined {}

	async initialize(data: InitializationPayload) {

		// Initialize vm context, set up globals
		const { context } = this;
		context.global = context;

		// Evaluation delegate
		const evaluate: Evaluate = (source, filename) => new vm.Script(source, { filename }).runInContext(context);

		// Load & link game runtime modules
		const runtime = await async function() {
			const resolutions = new Map<string, Promise<vm.Module>>();
			const linker = async (specifier: string, referencingModule?: vm.Module) => {
				const url = await resolver(specifier, referencingModule?.identifier);
				return getOrSet(resolutions, url, async () => {
					switch (url) {
						// Smuggled host modules
						case 'node:assert/strict':
						case 'node:process':
						case 'node:util':
						case '@xxscreeps/pathfinder':
							return hostLoaders[url](context);

						// All others
						default: return loader(context, url);
					}
				});
			};
			const module = await linker('xxscreeps/driver/sandbox/nodejs/runtime.js');
			await module.link(linker);
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
	async run(data: TickPayload): Promise<TickCompletion> {
		const start = process.hrtime.bigint();
		try {
			const completion = this.tick!(data);
			if (completion.result === 'success') {
				if (completion.payload.unsafeSandboxDidHalt) {
					return { result: 'disposed' };
				}
				completion.payload.usage.cpu = Number(process.hrtime.bigint() - start) / 1e6;
			}
			return completion;
		} catch (err: any) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			if (err.message.startsWith('Script execution timed out after')) {
				return { result: 'timedOut' as const };
			} else {
				throw err;
			}
		}
	}
}
