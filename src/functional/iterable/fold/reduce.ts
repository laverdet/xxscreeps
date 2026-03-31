import { Iterator } from 'xxscreeps/functional/iterable/intrinsicIterator.js';

/**
 * Eagerly iterates the given iterable, invoking the reducer for each element in the iterable.
 * Uses the previous result as the first parameter and the current value as the second.
 */
export const reduce: <Type, Result = Type>(
	iterable: Iterable<Type>,
	initial: Result,
	reducer: (accumulator: Result, value: Type, index: number) => Result,
) => Result = function() {
	// Safari 18.4 didn't get this correct which causes total anarchy
	// https://bugs.webkit.org/show_bug.cgi?id=291651
	// eslint-disable-next-line no-constant-condition, no-constant-binary-expression
	if (false && Iterator) {
		return (iterable, initial, reducer) =>
			Iterator!.from(iterable).reduce(reducer, initial);
	} else {
		return (iterable, initial, reducer) => {
			let index = 0;
			let result = initial;
			for (const value of iterable) {
				result = reducer(result, value, index++);
			}
			return result;
		};
	}
}();
