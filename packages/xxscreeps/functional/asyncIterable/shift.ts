interface ShiftAsyncEmpty extends AsyncDisposable {
	head: undefined;
	rest: undefined;
}

interface ShiftAsyncResult<Type> extends AsyncDisposable {
	head: Type;
	rest: AsyncIterable<Type>;
}

type ShiftedAsync<Type> = ShiftAsyncEmpty | ShiftAsyncResult<Type>;

/**
 * Returns the first element from an iterable, as well as another iterable that will continue after
 * the shifted element.
 */
export async function shiftAsync<Type>(iterable: AsyncIterable<Type, unknown>): Promise<ShiftedAsync<Type>> {
	const iterator = iterable[Symbol.asyncIterator]();
	const { done, value } = await iterator.next();
	if (done) {
		return {
			async [Symbol.asyncDispose]() {},
			head: undefined,
			rest: undefined,
		};
	} else {
		let didAccept = false;
		const rest: AsyncIterable<Type> = {
			[Symbol.asyncIterator]() {
				didAccept = true;
				return iterator;
			},
		};
		return {
			async [Symbol.asyncDispose]() {
				if (!didAccept) {
					await iterator.return?.();
				}
			},
			head: value,
			rest,
		};
	}
}
