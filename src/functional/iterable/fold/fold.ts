import { reduce } from 'xxscreeps/functional/iterable/fold/reduce.js';
import { shift } from 'xxscreeps/functional/iterable/shift.js';

/**
 * Similar to `reduce`. It invokes an operation over each element of an array, passing the previous
 * result as the first parameter of the next invocation. If the iterable is empty then `identity`
 * will be returned as default value.
 */
export function fold<Type, Identity = never>(
	iterable: Iterable<Type>,
	identity: Identity,
	operation: (left: Type, right: Type) => Type,
): Type | Identity {
	const { head, rest } = shift(iterable);
	if (rest) {
		return reduce(rest, head, operation);
	} else {
		return identity;
	}
}
