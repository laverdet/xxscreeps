import type { LooseIndexedPredicate } from 'xxscreeps/functional/iterable/filter.js';
import type { IndexedPredicateAs } from 'xxscreeps/functional/predicate.js';
import type { BooleanConvertible, Truthy } from 'xxscreeps/functional/types.js';
import { truthy } from 'xxscreeps/functional/iterable/filter.js';

/**
 * Iterates the iterable, and emits only truthy elements.
 */
export function filterAsync<Type extends BooleanConvertible>(asyncIterable: AsyncIterable<Type>): AsyncIterable<Truthy<Type>>;

/**
 * Iterates the iterable, emitting only elements which pass the predicate. You can use the type
 * guard to affect the type of the resulting iterator.
 */
export function filterAsync<Type, Filter extends Type>(
	asyncIterable: AsyncIterable<Type>,
	predicate: IndexedPredicateAs<Type, Filter>,
): AsyncIterable<Filter>;

/**
 * Iterates the iterable, emitting only elements which pass the predicate.
 */
export function filterAsync<Type>(
	asyncIterable: AsyncIterable<Type>,
	predicate: LooseIndexedPredicate<Type>,
): AsyncIterable<Type>;

export async function *filterAsync(
	asyncIterable: AsyncIterable<unknown>,
	predicate: LooseIndexedPredicate<unknown> = truthy,
) {
	let index = 0;
	for await (const value of asyncIterable) {
		if (Boolean(predicate(value, index++))) {
			yield value;
		}
	}
}
