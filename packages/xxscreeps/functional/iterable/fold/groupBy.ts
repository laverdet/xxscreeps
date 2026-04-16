import { identity } from 'xxscreeps/functional/function/identity.js';
import { map } from 'xxscreeps/functional/iterable/map.js';

/**
 * Simple utility which groups the given entry iterable by the key and returns a `Map` of the
 * results.
 */
export function groupBy<Key, Value>(
	entries: Iterable<readonly [ Key, Value ]>,
): Map<Key, Value[]>;
export function groupBy<Type, Key, Value>(
	entries: Iterable<Type>,
	mapper: (entry: Type) => readonly [ Key, Value ],
): Map<Key, Value[]>;
export function groupBy(
	iterable: Iterable<unknown>,
	mapper = identity as (entry: unknown) => readonly [ unknown, unknown ],
) {
	const groups = new Map<unknown, unknown[]>();
	for (const [ key, value ] of map(iterable, mapper)) {
		const values = groups.get(key);
		if (values) {
			values.push(value);
		} else {
			groups.set(key, [ value ]);
		}
	}
	return groups;
}
