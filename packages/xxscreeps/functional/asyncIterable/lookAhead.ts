/**
 * Returns an iterator which proxies the given generator, requesting up to `count` elements in
 * advance. If you break out of this loop there will be abandoned values!
 */
export function lookAhead<Type>(iterable: AsyncIterable<Type>, count = 1): AsyncIterable<Type> {
	type QueueItem = Promise<IteratorResult<Type>>;
	if (count <= 0) {
		return iterable;
	}
	return async function*() {
		const iterator = iterable[Symbol.asyncIterator]();
		try {
			// The prefetch is floated to pump the queue ahead of the consumer; a rejection
			// still surfaces through the awaited `queue[0]`, so each float takes a no-op
			// rejection handler to avoid leaking a duplicate unhandled rejection.
			const push = (result: IteratorResult<Type>) => {
				if (!result.done && queue.length <= count) {
					const next = iterator.next();
					void next.then(push, () => {});
					queue.push(next);
				}
			};
			const first = iterator.next();
			void first.then(push, () => {});
			const queue: [ QueueItem, ...QueueItem[] ] = [ first ];
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
