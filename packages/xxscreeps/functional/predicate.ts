import type { Nullable } from './types.js';
import { fold } from 'xxscreeps/functional/iterable/fold/fold.js';

/**
 * Strict boolean predicate
 */
export type Predicate<Type, Rest extends unknown[] = []> = (value: Type, ...rest: Rest) => boolean;
export type IndexedPredicate<Type> = Predicate<Type, [ index: number ]>;

/**
 * Predicate function which attests a given a type
 */
export type PredicateAs<Type, As extends Type, Rest extends unknown[] = []> = (value: Type, ...rest: Rest) => value is As;
export type IndexedPredicateAs<Type, As extends Type> = PredicateAs<Type, As, [ index: number ]>;

/**
 * Makes a predicate function which checks `instanceof` against a given constructor.
 */
export function instanceOfPredicate<Type>(species: abstract new (...args: any[]) => Type): PredicateAs<unknown, Type> {
	return (value): value is Type => value instanceof species;
}

export function invertedPredicate<
	Type,
	Rest extends [ context?: unknown ],
>(
	predicate: Predicate<Type, Rest>,
): Predicate<Type, Rest> {
	// @ts-expect-error -- Potential invoker arity mismatch
	return (value, context) => !predicate(value, context);
}

export function mappedPredicate<
	Type,
	Rest extends [ context?: unknown ],
	Result,
>(
	predicate: Predicate<Result, Rest>,
	map: (value: Type, ...rest: Rest) => Result,
): Predicate<Type, Rest> {
	// @ts-expect-error -- Potential invoker arity mismatch
	return (value, context) => predicate(map(value, context), context);
}

/**
 * Predicate which checks for `null` or `undefined` and narrows the type.
 */
export function nonNullPredicate<Type>(value: Nullable<Type>): value is Type {
	return value != null;
}

/**
 * Returns a new predicate which expresses if *all* of the given predicates are true.
 */
export function everyPredicate<
	From,
	Rest extends [ context?: unknown ],
	As extends From,
>(
	predicates: [
		first: PredicateAs<From, As, Rest>,
		// nb: TypeScript falls over if you try to chain assertive predicates together
		...rest: Predicate<NoInfer<As>, Rest>[],
	],
): PredicateAs<From, As, Rest>;
export function everyPredicate<Type, Rest extends [ context?: unknown ]>(predicates: Iterable<Predicate<Type, Rest>>): Predicate<Type, Rest>;
export function everyPredicate(predicates: Iterable<Predicate<unknown, [ context?: unknown ]>>): Predicate<unknown> {
	return fold(
		predicates,
		() => true,
		(predicate, next) => (value, context) => predicate(value, context) && next(value, context));
}

/**
 * Returns a new predicate which expresses if *any* of the given predicates are true.
 */
// @ts-expect-error -- https://github.com/microsoft/TypeScript/issues/54302
export function somePredicate<
	From,
	Rest extends [ context?: unknown ],
	To0 extends From,
	To1 extends From = never,
	To2 extends From = never,
>(
	predicates: [
		// nb: You can add as many as you want here (and to result)
		predicate1: PredicateAs<From, To0, Rest>,
		predicate2?: PredicateAs<From, To1, Rest>,
		predicate3?: PredicateAs<From, To2, Rest>,
	],
): PredicateAs<From, To0 | To1 | To2, Rest>;
export function somePredicate<Type, Rest extends [ context?: unknown ]>(predicates: Iterable<Predicate<Type, Rest>>): Predicate<Type, Rest>;
export function somePredicate(predicates: Iterable<Predicate<unknown, [ context?: unknown ]>>): Predicate<unknown> {
	return fold(
		predicates,
		() => true,
		(predicate, next) => (value, context) => predicate(value, context) || next(value, context));
}
