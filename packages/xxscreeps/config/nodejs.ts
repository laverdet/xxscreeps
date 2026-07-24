import type { ResolvedMod } from './mods.js';
import type { InitializeHook, LoadHook, ResolveHook } from 'node:module';
import { privateTransformLoader } from 'xxscreeps/driver/private/transform.js';
import { isProvide, makeModSourceText } from './loader.js';

/** @internal */
export interface LoaderConfig {
	mods: readonly ResolvedMod[];
	pathfinder: string;
	privateSymbolImplementation?: string;
	privateTransformBase?: string;
}

let mods: readonly ResolvedMod[];
let pathfinder: string;
let privateSymbolImplementation: string;
let privateTransformBase: string | undefined;

/** @internal */
export let initialize: InitializeHook<LoaderConfig> = data => {
	initialize = () => { throw new Error('Loader already initialized'); };
	({
		mods,
		pathfinder,
		privateSymbolImplementation = 'xxscreeps/driver/private/symbol/unsafe.js',
		privateTransformBase,
	} = data);
};

/** @internal */
export const resolve: ResolveHook = (specifier, context, nextResolve) => {
	switch (specifier) {
		case '@xxscreeps/pathfinder': return nextResolve(pathfinder, context);
		case 'xxscreeps:private-symbol': return nextResolve(privateSymbolImplementation, context);
		default:
			if (specifier.startsWith('xxscreeps:')) {
				return {
					url: specifier,
					shortCircuit: true,
				};
			} else {
				return nextResolve(specifier, {
					...context,
					...context.parentURL?.startsWith('xxscreeps:') && {
						parentURL: import.meta.url,
					},
				});
			}
	}
};

/** @internal */
export const load: LoadHook = (urlString, context, nextLoad) => {
	if (urlString.startsWith('xxscreeps:mods/')) {
		const provide = urlString.slice('xxscreeps:mods/'.length);
		if (!isProvide(provide)) {
			throw new Error(`Cannot find package '${provide}'`);
		}
		return {
			format: 'module',
			shortCircuit: true,
			source: makeModSourceText(mods, provide),
		};
	} else if (privateTransformBase !== undefined && urlString.startsWith(privateTransformBase) && context.importAttributes.type === undefined) {
		return async function() {
			return {
				format: 'module',
				shortCircuit: true,
				source: await privateTransformLoader(urlString),
			};
		}();
	} else {
		return nextLoad(urlString, context);
	}
};
