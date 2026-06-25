import { shiftAsync } from 'xxscreeps/functional/asyncIterable/shift.js';

/**
 * Returns the first matching element of the iterable, discarding the rest.
 */
export async function firstAsync<Type>(iterable: AsyncIterable<Type>): Promise<Type | undefined> {
	await using shift = await shiftAsync(iterable);
	return shift.head;
}
