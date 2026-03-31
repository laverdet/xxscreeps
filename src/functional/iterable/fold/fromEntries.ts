import { map } from 'xxscreeps/functional/iterable/map.js';

/**
 * It's like the constructor for `Map` except it returns a plain Object with a null prototype.
 */
export function fromEntries<Type, Key extends keyof any>(
	iterable: Iterable<readonly [ Key, Type ]>): Record<Key, Type>;
export function fromEntries<Type, Key extends keyof any, Value>(
	iterable: Iterable<Type>, callback: (value: Type) => readonly [ Key, Value ]): Record<Key, Value>;
export function fromEntries(iterable: Iterable<any>, callback?: (value: any) => readonly [ any, any ]) {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const object: Record<string, unknown> = Object.create(null);
	for (const [ key, value ] of callback ? map(iterable, callback) : iterable) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		object[key] = value;
	}
	return object;
}
