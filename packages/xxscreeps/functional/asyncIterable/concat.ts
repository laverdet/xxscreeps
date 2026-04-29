import { identity } from '../functional.js';
import { transformAsync } from './transform.js';

/**
 * Iterate each item from an iterable of iterables.
 */
export function concatAsync<Type>(
	iterables:
		AsyncIterable<Iterable<Type> | AsyncIterable<Type>> |
		Iterable<Iterable<Type> | AsyncIterable<Type>>,
): AsyncIterable<Type> {
	return transformAsync(iterables, identity);
}
