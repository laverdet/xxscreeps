interface ShiftAsyncEmpty {
	head: undefined;
	rest: undefined;
}

interface ShiftAsyncResult<Type> {
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
			head: undefined,
			rest: undefined,
		};
	} else {
		const rest: AsyncIterable<Type> = {
			[Symbol.asyncIterator]() {
				return iterator;
			},
		};
		return {
			head: value,
			rest,
		};
	}
}
