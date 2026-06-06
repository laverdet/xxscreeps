/** @internal */
export const Iterator: IteratorConstructor | undefined = globalThis.Iterator;

/** @internal */
export function toIterable<Type>(iterator: Iterator<Type>): Iterable<Type> {
	// @ts-expect-error
	return iterator;
}
