import { map } from 'xxscreeps/functional/iterable/map.js';
import { range } from 'xxscreeps/functional/iterable/range.js';

/**
 * Returns an array of iterables each of which iterates over a single invocation of the given
 * iterable. This can be used as a parallelization primitive.
 */
export function divide<Type>(iterable: AsyncIterable<Type>, count: number): AsyncIterable<Type>[] {
	let current: Promise<IteratorResult<Type>> | undefined;
	let remaining = count;
	const iterator = iterable[Symbol.asyncIterator]();
	const iterables = map(range(count), async function*() {
		try {
			while (true) {
				current = async function() {
					const previous = await current;
					if (previous?.done) {
						return previous;
					}
					return iterator.next();
				}();
				const result = await current;
				if (result.done) {
					break;
				} else {
					yield result.value;
				}
			}
		} finally {
			if (--remaining === 0) {
				await iterator.return?.();
			}
		}
	});
	return [ ...iterables ];
}
