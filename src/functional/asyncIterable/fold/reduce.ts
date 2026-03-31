/**
 * Eagerly iterates the given iterable, invoking the reducer for each element in the iterable.
 * Uses the previous result as the first parameter and the current value as the second.
 */
export async function reduceAsync<Type, Result = Type>(
	asyncIterable: AsyncIterable<Type>,
	initial: Result,
	reducer: (accumulator: Result, value: Type) => Result | PromiseLike<Result>,
): Promise<Result>;

/**
 * Eagerly iterates the given iterable, invoking the reducer for each element in the iterable.
 * Uses the previous result as the first parameter and the current value as the second.
 */
export async function reduceAsync<Type, Result = Type>(
	asyncIterable: AsyncIterable<Type> | Iterable<Type>,
	initial: Result,
	reducer: (accumulator: Result, value: Type) => PromiseLike<Result>,
): Promise<Result>;

/**
 * Eagerly iterates the given iterable, invoking the reducer for each element in the iterable.
 * Uses the previous result as the first parameter and the current value as the second.
 */
export async function reduceAsync<Type, Result = Type>(
	asyncIterable: AsyncIterable<Type> | Iterable<Type>,
	initial: Result,
	reducer: (accumulator: Result, value: Type) => Result | PromiseLike<Result>,
): Promise<Result> {
	let result = initial;
	for await (const value of asyncIterable) {
		result = await reducer(result, value);
	}
	return result;
}
