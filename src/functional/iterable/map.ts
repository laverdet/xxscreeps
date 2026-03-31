import { Iterator, toIterable } from './intrinsicIterator.js';

/**
 * Applies a given function to an iterable.
 */
export const map: <Type, Result>(
	iterable: Iterable<Type>,
	callback: (value: Type, index: number) => Result,
) => Iterable<Result> = function() {
	if (Iterator) {
		return (iterable, callback) =>
			toIterable(Iterator!.from(iterable).map(callback));
	} else {
		return function*(iterable, callback) {
			let index = 0;
			for (const value of iterable) {
				yield callback(value, index++);
			}
		};
	}
}();
