import { LooseBoolean } from './types';

// Like half the use cases of `reduce` are to sum an array, so this just does that with less
// boilerplate
export function accumulate(iterable: Iterable<number>, callback?: (value: number) => number): number;
export function accumulate<Type>(iterable: Iterable<Type>, callback: (value: Type) => number): number;
export function accumulate(iterable: Iterable<any>, callback: (value: any) => number = value => value) {
	let sum = 0;
	for (const value of iterable) {
		sum += callback(value);
	}
	return sum;
}

// Appends several iterators together
export function *concat<Type extends Iterable<any>[]>(...iterators: readonly [ ...Type ]):
Iterable<Type[number] extends (infer Result)[] ? Result : never> {
	for (const iterator of iterators) {
		for (const element of iterator) {
			yield element;
		}
	}
}

// Filter elements out an iterable
export function filter<Type>(iterable: Iterable<Type>): Iterable<NonNullOrVoidable<Type>>;
export function filter<Type, Filtered extends Type>(
	iterable: Iterable<Type>, callback: (value: Type) => value is Filtered): Iterable<Filtered>;
export function filter<Type>(
	iterable: Iterable<Type>, callback: (value: Type) => LooseBoolean): Iterable<Type>;
export function *filter(iterable: Iterable<any>, callback: (value: any) => LooseBoolean = nonNullable) {
	for (const value of iterable) {
		if (callback(value)) {
			yield value;
		}
	}
}

// Similar to [].some but it returns the matched element
export function firstMatching<Type, Matched extends Type>(
	iterable: Iterable<Type>, callback: (value: Type) => value is Matched): Matched | undefined;
export function firstMatching<Type>(
	iterable: Iterable<Type>, callback: (value: Type) => LooseBoolean): Type | undefined;
export function firstMatching(iterable: Iterable<any>, callback: (value: any) => LooseBoolean) {
	for (const value of iterable) {
		if (callback(value)) {
			return value;
		}
	}
}

// Simple for-loop
export function forEach<Type>(iterable: Iterable<Type>, callback: (value: Type) => void) {
	for (const value of iterable) {
		callback(value);
	}
}

// It's like the constructor for `Map` except it returns a plain Object
export function fromEntries<Type, Key extends keyof any>(
	iterable: Iterable<[ Key, Type ]>): Record<Key, Type>;
export function fromEntries<Type, Key extends keyof any, Value>(
	iterable: Iterable<Type>, callback: (value: Type) => [ Key, Value ]): Record<Key, Value>;
export function fromEntries(iterable: Iterable<any>, callback?: (value: any) => [ any, any ]) {
	return Object.fromEntries(callback ? map(iterable, callback) : iterable);
}

// It's like [].map except you can use it on iterables, also it doesn't generate a temporary array.
export function *map<Type, Result>(iterable: Iterable<Type>, callback: (value: Type) => Result): Iterable<Result> {
	for (const value of iterable) {
		yield callback(value);
	}
}

// If you just want the smallest element of an array it's senseless to sort the whole thing and take
// array[0]. You can just run through once and find that element in linear time
export function minimum<Type>(iterable: Iterable<Type>, callback: (left: Type, right: Type) => number) {
	let first = true;
	let minimum: Type | undefined;
	for (const value of iterable) {
		if (first) {
			first = false;
			minimum = value;
		} else if (callback(minimum!, value) > 0) {
			minimum = value;
		}
	}
	return minimum;
}

// Returns a range of numbers
export function *range(start: number, end?: number): Iterable<number> {
	if (end === undefined) {
		return range(0, start);
	} else if (start < end) {
		for (let ii = start; ii < end; ++ii) {
			yield ii;
		}
	} else {
		for (let ii = end; ii > start; --ii) {
			yield ii;
		}
	}
}

// Not nullable TS predicate
type NonNullOrVoidable<Type> = Type extends null | undefined | void ? never : Type;
function nonNullable<Type>(value: Type): value is NonNullOrVoidable<Type> {
	return value != null;
}
