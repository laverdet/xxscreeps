import type { ResolvedMod } from './mods.js';
import type { InitializeHook, LoadHook, ResolveHook } from 'node:module';
import { isProvide, makeModSourceText } from './loader.js';

/** @internal */
export interface LoaderConfig {
	pathfinder: string;
	mods: readonly ResolvedMod[];
}

let mods: readonly ResolvedMod[];
let pathfinder: string;

/** @internal */
export let initialize: InitializeHook<LoaderConfig> = data => {
	initialize = () => { throw new Error('Loader already initialized'); };
	({ mods, pathfinder } = data);
};

/** @internal */
export const resolve: ResolveHook = (specifier, context, nextResolve) => {
	if (specifier.startsWith('xxscreeps:')) {
		return {
			url: specifier,
			shortCircuit: true,
		};
	} else if (specifier === '@xxscreeps/pathfinder') {
		return nextResolve(pathfinder, context);
	} else {
		return nextResolve(specifier, context);
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
	} else {
		return nextLoad(urlString, context);
	}
};
