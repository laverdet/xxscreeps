import type { IndexedPredicate } from 'xxscreeps/functional/predicate.js';

/**
 * Yield elements starting from the first one for which predicate returns `false`
 */
export function *dropWhile<Type>(iterable: Iterable<Type>, predicate: IndexedPredicate<Type>) {
	let dropping = true;
	let ii = 0;
	for (const value of iterable) {
		if (dropping && predicate(value, ii++)) continue;
		dropping = false;
		yield value;
	}
}
