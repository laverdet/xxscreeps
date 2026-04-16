import { fold } from 'xxscreeps/functional/iterable/fold/fold.js';

/**
 * Comparator for two values. If the values are equal it must return 0, if `left` is less than
 * `right` then it must return a value less than 0, and otherwise it returns a value greater than 0.
 */
export type Comparator<Type> = (left: Type, right: Type) => number;

/**
 * Returns a comparator which combines the results of any number of comparators, short-circuiting
 * from left to right.
 */
export function compositeComparator<Type>(comparators: Iterable<Comparator<Type>>): Comparator<Type> {
	return fold(
		comparators,
		() => 0,
		(comparator, next) => (left, right) => comparator(left, right) || next(left, right));
}

/**
 * Inverts the given comparator.
 */
export function invertedComparator<Type>(comparator: Comparator<Type>): Comparator<Type> {
	return (left, right) => comparator(right, left);
}

/**
 * Creates a comparator from a mapping function and a comparator.
 */
export function mappedComparator<Type, Result>(
	comparator: Comparator<Result>,
	map: (value: Type) => Result,
): Comparator<Type> {
	return (left, right) => comparator(map(left), map(right));
}

type PrimitiveComparable = bigint | boolean | string;

/**
 * A comparator which can be used mainly for strings, but also bigint / booleans if you feel the
 * need for that kind of thing. You could use it for numbers too, but that's better suited to
 * `numeric` so the types don't permit it in that case.
 */
export function primitiveComparator<Type extends PrimitiveComparable>(left: Type, right: Type): number {
	return left < right ? -1 : left === right ? 0 : 1;
}

export const invertedPrimitiveComparator: <Type extends PrimitiveComparable>(left: Type, right: Type) => number =
	invertedComparator(primitiveComparator);

export function mappedPrimitiveComparator<Type>(map: (value: Type) => PrimitiveComparable): Comparator<Type> {
	return mappedComparator(primitiveComparator, map);
}

export function mappedInvertedPrimitiveComparator<Type>(map: (value: Type) => PrimitiveComparable): Comparator<Type> {
	return mappedComparator(invertedPrimitiveComparator, map);
}

/**
 * Comparator for numeric types.
 */
export function numericComparator(left: number, right: number): number {
	return left - right;
}

export const invertedNumericComparator: Comparator<number> = invertedComparator(numericComparator);

export function mappedNumericComparator<Type>(map: (value: Type) => number): Comparator<Type> {
	return mappedComparator(numericComparator, map);
}

export function mappedInvertedNumericComparator<Type>(map: (value: Type) => number): Comparator<Type> {
	return mappedComparator(invertedNumericComparator, map);
}
