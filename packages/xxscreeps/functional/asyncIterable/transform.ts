/**
 * Similar to `map` except the mapper returns an iterable which delegates to the result.
 */
export const transformAsync: <Type, Result>(
	iterable: AsyncIterable<Type>,
	callback: (value: Type, index: number) => AsyncIterable<Result> | Iterable<Result>,
) => AsyncIterable<Result> = function() {
	return async function*(iterable, callback) {
		let index = 0;
		for await (const value of iterable) {
			yield* callback(value, index++);
		}
	};
}();
