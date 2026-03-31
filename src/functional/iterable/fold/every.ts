import type { LooseIndexedPredicate } from 'xxscreeps/functional/iterable/filter.js';
import type { BooleanConvertible } from 'xxscreeps/functional/types.js';
import { truthy } from 'xxscreeps/functional/iterable/filter.js';
import { Iterator } from 'xxscreeps/functional/iterable/intrinsicIterator.js';
import { some } from './some.js';

interface Every {
	/**
	 * Returns `true` if the predicate is truthy for all elements, otherwise `false`. Eagerly iterates
	 * the whole iterable until a falsey value is found.
	 */
	(iterable: Iterable<BooleanConvertible>): boolean;
	<Type>(
		iterable: Iterable<Type>,
		predicate: LooseIndexedPredicate<Type>,
	): boolean;
}

type AnyEvery = (
	iterable: Iterable<unknown>,
	predicate?: LooseIndexedPredicate<unknown>,
) => boolean;

export const every: Every = function(): AnyEvery {
	if (Iterator) {
		return (iterable, predicate = truthy) =>
			Iterator!.from(iterable).every(predicate);
	} else {
		return (iterable, predicate = truthy) =>
			!some(iterable, (value, index) => !Boolean(predicate(value, index)));
	}
}();
