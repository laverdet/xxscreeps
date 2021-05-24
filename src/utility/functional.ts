import type { LooseBoolean } from './types';

// Like half the use cases of `reduce` are to sum an array, so this just does that with less
// boilerplate
export function accumulate<Type>(iterable: Iterable<Type>, callback: (value: Type) => number): number;
export function accumulate(iterable: Iterable<number>, callback?: (value: number) => number): number;
export function accumulate(iterable: Iterable<any>, callback: (value: any) => number = value => value) {
	let sum = 0;
	for (const value of iterable) {
		sum += callback(value);
	}
	return sum;
}

// Appends several iterators together
export function concat<Type>(iterator: Iterable<Iterable<Type>>): Iterable<Type>;
export function concat<First, Second, Rest = never>(
	first: Iterable<First>, second: Iterable<Second>, ...rest: Iterable<Rest>[]): Iterable<First | Second | Rest>;
export function *concat(...args: any[]) {
	for (const iterable of args.length === 1 ? args[0] : args) {
		for (const value of iterable) {
			yield value;
		}
	}
}

export function every<Type>(iterable: Iterable<Type>, callback: (value: Type) => LooseBoolean) {
	for (const value of iterable) {
		if (!callback(value)) {
			return false;
		}
	}
	return true;
}

export function some<Type>(iterable: Iterable<Type>, callback: (value: Type) => LooseBoolean) {
	for (const value of iterable) {
		if (callback(value)) {
			return true;
		}
	}
	return false;
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

export function reject<Type>(
	iterable: Iterable<Type>, callback: (value: Type) => LooseBoolean): Iterable<Type>;
export function *reject(iterable: Iterable<any>, callback: (value: any) => LooseBoolean) {
	for (const value of iterable) {
		if (!callback(value)) {
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
	const object = Object.create(null);
	for (const [ key, value ] of callback ? map(iterable, callback) : iterable) {
		object[key] = value;
	}
	return object;
}

export function join(iterable: Iterable<string>, join = '') {
	const { head, rest } = shift(iterable);
	if (head === undefined) {
		return '';
	}
	let str = head;
	for (const value of rest) {
		str += join + value;
	}
	return str;
}

// It's like [].map except you can use it on iterables, also it doesn't generate a temporary array.
export function *map<Type, Result>(iterable: Iterable<Type>, callback: (value: Type) => Result): Iterable<Result> {
	for (const value of iterable) {
		yield callback(value);
	}
}

// If you just want the smallest element of an array it's senseless to sort the whole thing and take
// array[0]. You can just run through once and find that element in linear time
export function minimum(iterable: Iterable<number>): number | undefined;
export function minimum<Type>(iterable: Iterable<Type>, callback: (left: Type, right: Type) => number): Type | undefined;
export function minimum<Type>(iterable: Iterable<Type>, callback: (left: any, right: any) => number = (left, right) => left - right) {
	const { head, rest } = shift(iterable);
	let minimum = head;
	for (const value of rest) {
		if (callback(minimum!, value) > 0) {
			minimum = value;
		}
	}
	return minimum;
}

// Returns a range of numbers
export function range(count?: number): Iterable<number>;
// eslint-disable-next-line @typescript-eslint/unified-signatures
export function range(start: number, end: number): Iterable<number>;
export function range(start = Infinity, end?: number): Iterable<number> {
	if (end === undefined) {
		return range(0, start);
	} else {
		return function *() {
			if (start < end) {
				if (end === Infinity) {
					for (let ii = start; ; ++ii) {
						yield ii;
					}
				} else {
					for (let ii = start; ii < end; ++ii) {
						yield ii;
					}
				}
			} else {
				for (let ii = end - 1; ii >= start; --ii) {
					yield ii;
				}
			}
		}();
	}
}

// Creates an iterable which applies the accumulator to each element and yields the result
export function *scan<Type, Result>(iterable: Iterable<Type>, initial: Result, accumulator: (result: Result, value: Type) => Result) {
	let result = initial;
	for (const value of iterable) {
		result = accumulator(result, value);
		yield result;
	}
}

/**
 * Returns the first element from an iterable, as well as another iterable that will continue after
 * the shifted element.
 */
export function shift<Type>(iterable: Iterable<Type>) {
	const iterator = iterable[Symbol.iterator]();
	const { done, value } = iterator.next();
	const rest: Iterable<Type> = done ? [] : {
		[Symbol.iterator]() {
			return iterator;
		},
	};
	return {
		head: value as Type | undefined,
		rest,
	};
}

/**
 * Yield up to the next `count` elements from the iterable
 */
export function *take<Type>(iterable: Iterable<Type>, count: number) {
	if (count === 0) {
		return;
	}
	let ii = 0;
	for (const value of iterable) {
		yield value;
		if (++ii >= count) {
			return;
		}
	}
}

// Not nullable TS predicate
type NonNullOrVoidable<Type> = Type extends null | undefined | void ? never : Type;
function nonNullable<Type>(value: Type): value is NonNullOrVoidable<Type> {
	return value != null;
}
