/**
 * Returns an iterator from `[0, count)`. You could use this with an array's length to iterate over
 * all members.
 */
export function range(count?: number): Iterable<number>;

/**
 * If `start` is less than `end`, returns an iterator `[start, end)`. Otherwise returns an iterator
 * from `(end, start]`.
 */
// eslint-disable-next-line @typescript-eslint/unified-signatures
export function range(start: number, end: number): Iterable<number>;

export function range(start = Infinity, end?: number): Iterable<number> {
	if (end === undefined) {
		// First overload
		return range(0, start);
	} else {
		return function*() {
			if (start < end) {
				for (let ii = start; ii < end; ++ii) {
					yield ii;
				}
			} else {
				for (let ii = start - 1; ii >= end; --ii) {
					yield ii;
				}
			}
		}();
	}
}
