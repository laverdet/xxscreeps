import type { IndexedPredicate, IndexedPredicateAs } from 'xxscreeps/functional/predicate.js';
import { filter } from './filter.js';

/**
 * Iterates the iterable, omitting elements which pass the predicate. You can use the type guard to
 * affect the type of the resulting iterator.
 */
export function reject<Type, Reject extends Type>(
	iterable: Iterable<Type>,
	predicate: IndexedPredicateAs<Type, Reject>,
): Iterable<Exclude<Type, Reject>>;
/**
 * Iterates the iterable, omitting elements which pass the predicate.
 */
export function reject<Type>(
	iterable: Iterable<Type>,
	predicate: IndexedPredicate<Type>,
): Iterable<Type>;

export function reject<Type>(
	iterable: Iterable<Type>,
	predicate: IndexedPredicate<Type>,
) {
	return filter(iterable, (value, index) => !predicate(value, index));
}
