interface ShiftEmpty extends Disposable {
	head: undefined;
	rest: undefined;
}

interface ShiftResult<Type> extends Disposable {
	head: Type;
	rest: Iterable<Type>;
}

type Shifted<Type> = ShiftEmpty | ShiftResult<Type>;

/**
 * Returns the first element from an iterable, as well as another iterable that will continue after
 * the shifted element.
 */
export function shift<Type>(iterable: Iterable<Type, unknown>): Shifted<Type> {
	const iterator = iterable[Symbol.iterator]();
	const { done, value } = iterator.next();
	if (done) {
		return {
			async [Symbol.dispose]() {},
			head: undefined,
			rest: undefined,
		};
	} else {
		let didAccept = false;
		const rest: Iterable<Type> = {
			[Symbol.iterator]() {
				didAccept = true;
				return iterator;
			},
		};
		return {
			[Symbol.dispose]() {
				if (!didAccept) {
					iterator.return?.();
				}
			},
			head: value,
			rest,
		};
	}
}
