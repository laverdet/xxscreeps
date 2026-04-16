import { toIterable } from 'xxscreeps/functional/iterable/intrinsicIterator.js';

/**
 * Returns an iterable which iterates over a given slice of an array in place.
 */
export function slice<Type>(array: readonly Type[], start: number, end: number = array.length): Iterable<Type> {
	return toIterable(function*() {
		for (let ii = start; ii < end; ++ii) {
			yield array[ii];
		}
	}());
}
