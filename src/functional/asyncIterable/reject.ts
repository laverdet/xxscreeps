import type { IndexedPredicate, IndexedPredicateAs } from 'xxscreeps/functional/predicate.js';
import { invertedPredicate } from 'xxscreeps/functional/predicate.js';
import { filterAsync } from './filter.js';

/**
 * Iterates the iterable, omitting elements which pass the predicate. You can use the type guard to
 * affect the type of the resulting iterator.
 */
export function rejectAsync<Type, Reject extends Type>(
	asyncIterable: AsyncIterable<Type>,
	predicate: IndexedPredicateAs<Type, Reject>,
): AsyncIterable<Exclude<Type, Reject>>;

/**
 * Iterates the iterable, omitting elements which pass the predicate.
 */
export function rejectAsync<Type>(
	asyncIterable: AsyncIterable<Type>,
	predicate: IndexedPredicate<Type>,
): AsyncIterable<Type>;

export function rejectAsync<Type>(
	asyncIterable: AsyncIterable<Type>,
	predicate: IndexedPredicate<Type>,
): AsyncIterable<Type> {
	return filterAsync(asyncIterable, invertedPredicate(predicate));
}
