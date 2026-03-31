/**
 * Applies a given function to an async iterable.
 */
export function mapAsync<Type, Result>(
	asyncIterable: AsyncIterable<Type>,
	callback: (value: Type) => Result | PromiseLike<Result>,
): AsyncIterable<Result>;

/**
 * Applies a given async function to an async or sync iterable.
 */
export function mapAsync<Type, Result>(
	asyncIterable: AsyncIterable<Type> | Iterable<Result>,
	callback: (value: Type) => PromiseLike<Result>,
): AsyncIterable<Result>;

export async function *mapAsync<Type, Result>(
	asyncIterable: AsyncIterable<Type> | Iterable<Type>,
	callback: (value: Type) => Result | PromiseLike<Result>,
): AsyncIterable<Result> {
	for await (const value of asyncIterable) {
		yield callback(value);
	}
}
