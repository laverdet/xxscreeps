import { toIterable } from './intrinsicIterator.js';

interface ShiftEmpty {
	head: undefined;
	rest: undefined;
}

interface ShiftResult<Type> {
	head: Type;
	rest: Iterable<Type>;
}

type Shifted<Type> = ShiftEmpty | ShiftResult<Type>;

/**
 * Returns the first element from an iterable, as well as another iterable that will continue after
 * the shifted element.
 */
export function shift<Type>(iterable: Iterable<Type, unknown>): Shifted<Type> {
	const iterator = iterable[Symbol.iterator]();
	const { done, value } = iterator.next();
	if (done) {
		return {
			head: undefined,
			rest: undefined,
		};
	} else {
		return {
			head: value,
			rest: toIterable(iterator),
		};
	}
}
