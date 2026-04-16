/** @internal */
export const Iterator: IteratorConstructor | undefined = globalThis.Iterator;

/** @internal */
export function toIterable<Type>(iterator: Iterator<Type>): Iterable<Type> {
	return {
		[Symbol.iterator]() {
			return iterator;
		},
	};
}
