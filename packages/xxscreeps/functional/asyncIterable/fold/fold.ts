import { shiftAsync } from 'xxscreeps/functional/asyncIterable/shift.js';
import { reduceAsync } from './reduce.js';

/**
 * Similar to `reduce`. It invokes an operation over each element of an array, passing the previous
 * result as the first parameter of the next invocation. If the iterable is empty then `identity`
 * will be returned as default value.
 */
export async function foldAsync<Type, Identity = never>(
	iterable: AsyncIterable<Type>,
	identity: Identity,
	operation: (left: Type, right: Type) => Type | PromiseLike<Type>,
): Promise<Type | Identity> {
	const { head, rest } = await shiftAsync(iterable);
	if (rest) {
		return reduceAsync(rest, head, operation);
	} else {
		return identity;
	}
}
