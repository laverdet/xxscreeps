/**
 * Eagerly iterates the given iterable, invoking the reducer for each element in the iterable.
 * Uses the previous result as the first parameter and the current value as the second.
 */
export const reduce: <Type, Result = Type>(
	iterable: Iterable<Type>,
	initial: Result,
	reducer: (accumulator: Result, value: Type, index: number) => Result,
) => Result = function() {
	return (iterable, initial, reducer) => {
		let index = 0;
		let result = initial;
		for (const value of iterable) {
			result = reducer(result, value, index++);
		}
		return result;
	};
}();
