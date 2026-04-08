import type { IndexedPredicateAs } from 'xxscreeps/functional/predicate.js';
import type { BooleanConvertible, Truthy } from 'xxscreeps/functional/types.js';
import { Iterator, toIterable } from 'xxscreeps/functional/iterable/intrinsicIterator.js';

/** Do not explicitly use this! */
export type LooseIndexedPredicate<Type> = (value: Type, index: number) => BooleanConvertible;

/** @internal */
export const truthy: <Type>(value: Type) => value is Truthy<Type> = Boolean as never;

interface Filter {
	/**
	 * Iterates the iterable, and emits only truthy elements.
	 */
	<Type extends BooleanConvertible>(iterable: Iterable<Type>): Iterable<Truthy<Type>>;

	/**
	 * Iterates the iterable, emitting only elements which pass the predicate. You can use the type
	 * guard to affect the type of the resulting iterator.
	 */
	<Type, Filter extends Type>(
		iterable: Iterable<Type>,
		predicate: IndexedPredicateAs<Type, Filter>,
	): Iterable<Filter>;

	/**
	 * Iterates the iterable, emitting only elements which pass the predicate.
	 */
	<Type>(
		iterable: Iterable<Type>,
		predicate: LooseIndexedPredicate<Type>,
	): Iterable<Type>;
}

type AnyFilter = (
	iterable: Iterable<unknown>,
	predicate?: LooseIndexedPredicate<unknown>,
) => Iterable<unknown>;

export const filter: Filter = function(): AnyFilter {
	if (Iterator) {
		return (iterable, predicate = truthy) =>
			toIterable(Iterator!.from(iterable).filter(predicate));
	} else {
		return function*(iterable, predicate = truthy) {
			let index = 0;
			for (const value of iterable) {
				if (Boolean(predicate(value, index++))) {
					yield value;
				}
			}
		};
	}
}();
