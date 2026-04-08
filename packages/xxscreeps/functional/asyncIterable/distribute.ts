import { collect } from './collect.js';
import { divide } from './divide.js';

/**
 * Applies a transformation function to the given iterable with applied concurrency. Note that the
 * order of the returned iterable may not match the order of the input iterable.
 */
export function distribute<Type, Result = Type>(
	iterable: AsyncIterable<Type>,
	concurrency: number,
	transform: (iterable: AsyncIterable<Type>) => AsyncIterable<Result>,
): AsyncIterable<Result> {
	return collect(divide(iterable, concurrency).map(transform));
}
