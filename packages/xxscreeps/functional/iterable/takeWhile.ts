import type { IndexedPredicate } from 'xxscreeps/functional/predicate.js';

/**
 * Yield elements until predicate returns `false`
 */
export function *takeWhile<Type>(iterable: Iterable<Type>, predicate: IndexedPredicate<Type>) {
	let ii = 0;
	for (const value of iterable) {
		if (predicate(value, ii++)) {
			yield value;
		} else {
			return;
		}
	}
}
