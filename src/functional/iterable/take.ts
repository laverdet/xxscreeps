/**
 * Yield up to the next `count` elements from the iterable
 */
export function *take<Type>(iterable: Iterable<Type>, count: number) {
	if (count === 0) {
		return;
	}
	let ii = 0;
	for (const value of iterable) {
		yield value;
		if (++ii >= count) {
			return;
		}
	}
}
