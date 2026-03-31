import { map } from './map.js';

/**
 * Applies a given async function to an iterable, and returns a promise to an array of the results.
 */
export function mapAwait<Type, Result>(
	iterable: Iterable<Type>,
	callback: (value: Type) => Result | PromiseLike<Result>,
): Promise<Result[]> {
	return Promise.all(map(iterable, callback));
}
