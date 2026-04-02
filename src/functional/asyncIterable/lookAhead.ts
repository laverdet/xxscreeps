/**
 * Returns an iterator which proxies the given generator, requesting up to `count` elements in
 * advance. If you break out of this loop there will be abandoned values!
 */
export function lookAhead<Type>(iterable: AsyncIterable<Type>, count = 1) {
	if (count <= 0) {
		return iterable;
	}
	return async function*() {
		const iterator = iterable[Symbol.asyncIterator]();
		try {
			const push = (result: IteratorResult<Type>) => {
				if (!result.done && queue.length <= count) {
					const next = iterator.next();
					void next.then(push);
					queue.push(next);
				}
			};
			const first = iterator.next();
			void first.then(push);
			const queue = [ first ];
			while (true) {
				const next = await queue[0];
				if (next.done) {
					return;
				}
				void queue.shift();
				push(next);
				yield next.value;
			}
		} finally {
			await iterator.return?.();
		}
	}();
}
