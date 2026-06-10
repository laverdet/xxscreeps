import type { ResolvedMod } from './mods.js';

const providesNames = [ 'backend', 'config', 'constants', 'driver', 'game', 'main', 'processor', 'storage', 'test' ] as const;
/** @internal */
export type Provide = typeof providesNames[number];
/** @internal */
export const isProvide = (value: string): value is Provide => providesNames.includes(value as Provide);

// `makeModSourceText` helpers
const makeMakeGenericSource =	(
	make: (url: string, ii: number) => string,
	fold: (sources: string[]) => string = sources => sources.join('\n') + '\n',
) =>
	(mods: readonly ResolvedMod[], provider: Provide) =>
		fold(mods
			.map(mod => mod.provides[provider])
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			.filter(url => url != null)
			.map(make));

const makeConstantsSource = makeMakeGenericSource(url => `export * from ${JSON.stringify(url)};`);
const makeSideEffectsSource = makeMakeGenericSource(url => `import ${JSON.stringify(url)};`);
const makeConfigSource = makeMakeGenericSource(
	(url, ii) =>
		`import * as config${ii} from ${JSON.stringify(url)};
		import schema${ii} from ${JSON.stringify(new URL('config.schema.json', url))} with { type: 'json' };`,
	sources =>
		`${sources.join('\n')}
		const configs = [ ${[ ...Array(sources.length).keys() ].map(ii => `config${ii}`).join(', ')} ];
		export const defaults = configs.map(({ defaults }) => defaults).filter(Boolean);
		export const initializationDefaults = configs.map(({ initializationDefaults }) => initializationDefaults).filter(Boolean);
		export const schemas = [ ${[ ...Array(sources.length).keys() ].map(ii => `schema${ii}`).join(', ')} ];\n`,
);

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
			default: return makeSideEffectsSource;
		}
	}();
	return make(mods, provider);
}
