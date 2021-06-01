import { getOwnPrivateEntries } from 'xxscreeps/driver/private/runtime';

export function entriesWithSymbols<T extends {}>(object: T): [ keyof T, T[keyof T] ][] {
	return [
		...Object.entries(object),
		...Object.getOwnPropertySymbols(object).map(key => [ key, object[key as never] ]),
		...getOwnPrivateEntries(object),
	] as [ any, any ][];
}
