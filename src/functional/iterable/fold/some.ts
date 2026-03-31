import type { LooseIndexedPredicate } from 'xxscreeps/functional/iterable/filter.js';
import type { BooleanConvertible } from 'xxscreeps/functional/types.js';
import { truthy } from 'xxscreeps/functional/iterable/filter.js';
import { Iterator } from 'xxscreeps/functional/iterable/intrinsicIterator.js';

interface Some {
	/**
	 * Returns `true` if the predicate is truthy for any element, otherwise `false`. Eagerly iterates
	 * the whole iterable until a truthy value is found.
	 */
	(iterable: Iterable<BooleanConvertible>): boolean;
	<Type>(
		iterable: Iterable<Type>,
		predicate: LooseIndexedPredicate<Type>,
	): boolean;
}

type AnySome = (
	iterable: Iterable<unknown>,
	predicate?: LooseIndexedPredicate<unknown>,
) => boolean;

export const some: Some = function(): AnySome {
	if (Iterator) {
		return (iterable, predicate = truthy) =>
			Iterator!.from(iterable).some(predicate);
	} else {
		return (iterable, predicate = truthy) => {
			let index = 0;
			for (const value of iterable) {
				if (Boolean(predicate(value, index++))) {
					return true;
				}
			}
			return false;
		};
	}
}();
