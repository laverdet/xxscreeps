interface DisposableAsyncIterable<Type> extends AsyncIterable<Type>, AsyncDisposable {}

/**
 * Allows multiple loops to continue iterating over the same backing iterable. The resource is
 * released via explicit resource management.
 */
export function unbreak<Type>(iterable: AsyncIterable<Type>): DisposableAsyncIterable<Type> {
	let underlyingIterator: AsyncIterator<Type> | undefined;
	let unbreakIterator: AsyncIterator<Type> | undefined;
	return {
		async [Symbol.asyncDispose]() {
			await underlyingIterator?.return?.();
		},
		[Symbol.asyncIterator](): AsyncIterator<Type> {
			return unbreakIterator ??= function() {
				const iterator = underlyingIterator = iterable[Symbol.asyncIterator]();
				return {
					next() {
						return iterator.next();
					},
				};
			}();
		},
	};
}
