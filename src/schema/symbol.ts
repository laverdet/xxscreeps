import { ownPrivateEntries } from 'xxscreeps/driver/private/runtime';

/**
 * TypeScript has pretty lousy support for Symbols in declaration files, see:
 * https://github.com/microsoft/TypeScript/issues/1863
 * https://github.com/microsoft/TypeScript/issues/37888
 * https://github.com/microsoft/TypeScript/issues/43154
 *
 * Instead a fake string type is returned which provides similar functionality and `Symbol` is
 * actually used at runtime. This also provides a convenient place to hook to change these into v8
 * private symbols in the game runtime.
 */
export const XSymbol: {
	for: (name: string) => any;
	<Name extends string>(name: Name): `_$${Name}`;
} = Symbol as never;

export function entriesWithSymbols<T extends {}>(object: T): [ keyof T, T[keyof T] ][] {
	return [
		...Object.entries(object),
		...Object.getOwnPropertySymbols(object).map(key => [ key, object[key as never] ]),
		...ownPrivateEntries(object),
	] as [ any, any ][];
}
