import type { MaybeCompletionOf, Reference } from '@isolated-vm/experimental';
import type { Sandbox, TickCompletion } from 'xxscreeps/driver/sandbox/index.js';
import type { InitializationPayload, TickPayload } from 'xxscreeps/engine/runner/index.js';
import * as fs from 'node:fs/promises';
import { Agent, Module, Realm, expect, expectComplete } from '@isolated-vm/experimental';
import { makeCachedLoader, makeLinker } from '@isolated-vm/experimental/utility/linker';
import { resolve } from '@loaderkit/resolve/esm';
import { defaultAsyncFileSystem } from '@loaderkit/resolve/fs';
import * as pf from '@xxscreeps/pathfinder/iv';
import { makeModSourceText } from 'xxscreeps/config/loader.js';
import { mods } from 'xxscreeps/config/mods.js';
import { privateTransformLoader } from 'xxscreeps/driver/private/transform.js';
import { makePackagesModule } from 'xxscreeps/engine/schema/build/index.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';

type Runtime = typeof import('xxscreeps/driver/sandbox/experimental/runtime.js');

// Resolve specifier & referrer to canonical URL
const resolver = function() {
	const cache = new Map<string, Promise<string>>();
	return async (specifier: string, referrer?: string) => {
		const key = `${referrer ?? ''}::${specifier}`;
		switch (specifier) {
			case '#iv': return 'xxscreeps:pathfinder';
			case 'xxscreeps:mods/constants': return 'xxscreeps:mods/constants';
			case 'xxscreeps:mods/game': return 'xxscreeps:mods/game';
			case 'xxscreeps:packages': return 'xxscreeps:packages';
			default: return getOrSet(cache, key, async () => {
				const alias = function() {
					switch (specifier) {
						case '@xxscreeps/pathfinder': return '@xxscreeps/pathfinder/iv';
						case 'tslib': return 'tslib/tslib.es6.mjs';
						case 'xxscreeps:private-symbol': return 'xxscreeps/driver/private/symbol/unsafe.js';
						case 'xxscreeps/driver/runtime/source-map.js': return 'xxscreeps/driver/sandbox/nodejs/source-map.js';
						case 'xxscreeps/engine/processor/index.js': throw new Error('processor required from runtime');
						case 'xxscreeps/engine/schema/build/index.js': return 'xxscreeps/engine/schema/build/runtime.js';
						default: return specifier;
					}
				}();
				const { url } = await resolve(defaultAsyncFileSystem, alias, new URL(referrer ?? import.meta.url));
				return url.href;
			});
		}
	};
}();

// `Module` loader
const makeLoader = function() {
	interface ModuleSourceTextRecord {
		sourceText: string;
	}
	const cache = new Map<string, ModuleSourceTextRecord>();
	const xxPath = new URL('../../..', import.meta.url).href;
	return (agent: Agent, realm: Realm) =>
		async (url: string) => {
			if (url === 'xxscreeps:pathfinder') {
				return expect(await pf.module.instantiate(realm));
			} else {
				const cached = cache.get(url);
				if (cached) {
					return expectComplete(await agent.compileModule(cached.sourceText, { origin: { name: url } }));
				} else {
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
							switch (url) {
								case 'node:process': return 'export default {}';
								case 'node:util': return 'export const formatWithOptions = String, inspect = String';
								default: return fs.readFile(new URL(url), 'utf8');
							}
						}
					}();
					const module = agent.compileModule(sourceText, { origin: { name: url } });
					cache.set(url, { sourceText });
					return expectComplete(await module);
				}
			}
		};
}();

export class ExperimentalSandbox implements Sandbox {
	private readonly tick;
	private readonly isolate: Agent;

	constructor(isolate: Agent, tick: Reference<Runtime['tick']>) {
		this.isolate = isolate;
		this.tick = tick;
	}

	static async create(data: InitializationPayload) {
		// Load & link game runtime modules
		const agent = await Agent.create();
		const realm = expect(await agent.createRealm());
		const loader = makeCachedLoader(makeLoader(agent, realm));
		const linker = makeLinker(resolver, loader);
		const module = await loader(await resolver('xxscreeps/driver/sandbox/experimental/runtime.js')) as Module;
		await module.link(realm, linker);
		await module.evaluate(realm);

		// Initialize runtime.ts and load player code + memory
		const global = await realm.acquireGlobalObject();
		const [ initialize, tick ] = await Promise.all([
			global.get('initialize') as Promise<Reference<Runtime['initialize']>>,
			global.get('tick') as Promise<Reference<Runtime['tick']>>,
		]);
		await initialize.invoke([ data ]);
		return new ExperimentalSandbox(agent, tick);
	}

	createInspectorSession(): never {
		throw new Error('Inspector not supported with `sandbox: experimental`');
	}

	async dispose() {
		try {
			await this.isolate.disposeAsync();
		} catch {}
	}

	async run(args: TickPayload): Promise<TickCompletion> {
		const completion = await this.tick.invoke([ args ]) as MaybeCompletionOf<TickCompletion>;
		if (completion) {
			if (completion.complete) {
				return completion.result;
			} else {
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				throw new Error(`Sandbox error: ${completion.error}`);
			}
		} else {
			return { result: 'disposed' };
		}
	}
}
