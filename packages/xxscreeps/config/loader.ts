import type { Manifest, ResolvedMod } from './mods.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { nonNullPredicate } from 'xxscreeps/functional/predicate.js';
import { makeRelativeFragment } from 'xxscreeps/utility/url.js';

const provideNames = [ 'backend', 'config', 'constants', 'driver', 'game', 'main', 'processor', 'schema', 'storage', 'test' ] as const;
/** @internal */
export type Provide = typeof provideNames[number];
/** @internal */
export const isProvide = (value: string): value is Provide => provideNames.includes(value as Provide);

type Make = (mods: readonly ResolvedMod[], provider: Provide) => string;

// `makeModSourceText` helpers
const makeMakeGenericSource = (
	make: (info: { js: string; types?: Manifest['types'] }, ii: number) => string | undefined,
	fold?: (sources: string[], provide: Provide) => string,
): Make => (mods, provide) =>
	Fn.pipe(
		mods,
		$$ => Fn.map($$, mod => {
			const js = mod.provides[provide];
			const types = mod.types;
			if (js) {
				return { js, types };
			}
		}),
		$$ => Fn.filter($$),
		$$ => Fn.map($$, make),
		$$ => Fn.filter($$, nonNullPredicate),
		fold
			? $$ => fold([ ...$$ ], provide)
			: $$ => Fn.join($$, '\n') + '\n');

// xxscreeps:mods/constants
const makeConstantsSource = makeMakeGenericSource(({ js }) => `export * from ${JSON.stringify(js)};`);

// xxscreeps:mods/schema
const makeSchemaSource = makeMakeGenericSource(({ js }) => `import ${JSON.stringify(js)};`);

// xxscreeps:mods/config
const makeConfigSource = makeMakeGenericSource(
	({ js }, ii) =>
		`import * as config${ii} from ${JSON.stringify(js)};
		import schema${ii} from ${JSON.stringify(new URL('config.schema.json', js))} with { type: 'json' };`,
	sources =>
		`${sources.join('\n')}
		const configs = [ ${[ ...Array(sources.length).keys() ].map(ii => `config${ii}`).join(', ')} ];
		export const defaults = configs.map(({ defaults }) => defaults).filter(Boolean);
		export const initializationDefaults = configs.map(({ initializationDefaults }) => initializationDefaults).filter(Boolean);
		export const schemas = [ ${[ ...Array(sources.length).keys() ].map(ii => `schema${ii}`).join(', ')} ];\n`,
);

// xxscreeps:mods/* (without exports)
const makeSideEffectsSource = makeMakeGenericSource(({ js }) =>
	`import "xxscreeps:mods/schema";
	import ${JSON.stringify(js)};`,
);

// Resolve 'dist/[..]/*.js' to '/[..]/*.ts'
const makeTypeScriptSpecifier = ({ js, types }: { js: string; types?: Manifest['types'] }) => {
	if (types) {
		const rel = makeRelativeFragment(types.js, new URL(js));
		return `${types.name}/${rel.slice(2)}`;
	}
};

// constants.d.ts
const makeConstantsTypeScriptSource = makeMakeGenericSource(
	info => {
		const specifier = makeTypeScriptSpecifier(info);
		return specifier === undefined ? undefined : `export * from ${JSON.stringify(specifier)};`;
	},
	sources =>
		`declare module 'xxscreeps:mods/constants' {
		${sources.join('\n')}
		}`);

// effects.d.ts (once per provide type)
const makeEffectsTypeScriptSource = makeMakeGenericSource(
	info => {
		const specifier = makeTypeScriptSpecifier(info);
		return specifier === undefined ? undefined : `import ${JSON.stringify(specifier)};`;
	},
	(sources, provider) =>
		`declare module 'xxscreeps:mods/${provider}' {
		${sources.join('\n')}
		}`);

/**
 * Render source text module which imports the given `Provide` from each module
 * @internal
 */
export function makeModSourceText(mods: readonly ResolvedMod[], provider: Provide) {
	const make = function() {
		// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
		switch (provider) {
			case 'config': return makeConfigSource;
			case 'constants': return makeConstantsSource;
			case 'schema': return makeSchemaSource;
			default: return makeSideEffectsSource;
		}
	}();
	return make(mods, provider);
}

/**
 * Render TypeScript source text module representing a `.d.ts` file.
 * @internal
 */
export function makeModTypeScriptText(mods: readonly ResolvedMod[], provider: Provide) {
	const make = function() {
		// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
		switch (provider) {
			case 'constants': return makeConstantsTypeScriptSource;
			default: return makeEffectsTypeScriptSource;
		}
	}();
	return make(mods, provider);
}
