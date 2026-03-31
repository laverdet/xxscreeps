/**
 * Intersperses `separator` between every element of an iterable.
 */
export function *intersperse<Type, Separator>(iterable: Iterable<Type>, separator: Separator): Iterable<Type | Separator> {
	let first = true;
	for (const value of iterable) {
		if (first) {
			first = false;
		} else {
			yield separator;
		}
		yield value;
	}
}
