import { toIterable } from 'xxscreeps/functional/iterable/intrinsicIterator.js';

/**
 * Returns an iterable which iterates over a given slice of an array in place.
 */
export function slice<Type>(array: readonly Type[], start: number, end: number = array.length): Iterable<Type> {
	return toIterable(function*() {
		const adjustedEnd = Math.min(end, array.length);
		for (let ii = start; ii < adjustedEnd; ++ii) {
			yield array[ii];
		}
	}());
}
