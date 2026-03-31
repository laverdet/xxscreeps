/**
 * Creates an iterable which applies the accumulator to each element and yields the result. This
 * operation is very similar to `reduce` except instead of returning the final result, it yields
 * each intermediate result.
 */
export function *scan<Result, Type>(
	iterable: Iterable<Type>,
	initial: Result,
	accumulator: (result: Result, value: Type) => Result,
): Iterable<Result> {
	let result = initial;
	for (const value of iterable) {
		result = accumulator(result, value);
		yield result;
	}
}
