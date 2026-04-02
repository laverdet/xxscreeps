import { shift } from 'xxscreeps/functional/iterable/shift.js';

/**
 * Returns the first matching element of the iterable, discarding the rest.
 */
export function first<Type>(iterable: Iterable<Type>): Type | undefined {
	const { head, rest } = shift(iterable);
	rest?.[Symbol.iterator]().return?.();
	return head;
}
