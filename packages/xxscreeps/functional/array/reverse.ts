/**
 * Iterates an array in reverse without modifying the original array.
 */
export function *reverse<Type>(array: readonly Type[]): Iterable<Type> {
	for (let ii = array.length - 1; ii >= 0; --ii) {
		yield array[ii]!;
	}
}
