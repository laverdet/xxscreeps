import type { IndexedPredicate } from 'xxscreeps/functional/predicate.js';

/**
 * Reorders the array in place so that all elements which pass the predicate precede the elements
 * which do not. Returns the index of the first element of the second group. The relative order of
 * the first group is preserved; the second group's is not.
 */
export function partition<Type>(array: Type[], predicate: IndexedPredicate<Type>): number {
	let cursor = 0;
	for (const [ ii, value ] of array.entries()) {
		if (predicate(value, ii)) {
			array[ii] = array[cursor]!;
			array[cursor++] = value;
		}
	}
	return cursor;
}
