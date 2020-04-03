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

// Checks that a value can be casted to a type, but returns the original type. The curry thing here
// is needed because TypeScript doesn't support optional generic parameters
export function checkCast<Type>() {
	return <Value extends Type>(value: Value) => value;
}

// Clamps a number to a given range
export function clamp(min: number, max: number, value: number) {
	return Math.max(min, Math.min(max, value));
}

// Appends several iterators together
export function concatInPlace<Type>(...iterators: Iterable<Type>[]): Iterable<Type>;
export function concatInPlace<T1, T2>(i1: Iterable<T1>, i2: Iterable<T2>): Iterable<T1 | T2>;
export function concatInPlace<T1, T2, T3>(i1: Iterable<T1>, i2: Iterable<T2>, i3: Iterable<T3>): Iterable<T1 | T2 | T3>;
export function concatInPlace<T1, T2, T3, T4>(i1: Iterable<T1>, i2: Iterable<T2>, i3: Iterable<T3>, i4: Iterable<T4>): Iterable<T1 | T2 | T3 | T4>;
export function *concatInPlace(...iterators: Iterable<any>[]) {
	for (const iterator of iterators) {
		for (const element of iterator) {
			yield element;
		}
	}
}

// Replace a value on an object with a new one, and returns the old one.
export function exchange<Target extends object, Name extends keyof Target>(
		target: Target, name: Name, newValue?: Target[Name]) {
	const value = target[name];
	target[name] = newValue!;
	return value;
}

export function filterInPlace<Type, Filtered extends Type>(
	iterable: Iterable<Type>, callback: (value: Type) => value is Filtered): Generator<Filtered>;
export function filterInPlace<Type>(
	iterable: Iterable<Type>, callback: (value: Type) => LooseBoolean): Generator<Type>;
export function *filterInPlace(iterable: Iterable<any>, callback: (value: any) => LooseBoolean) {
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

// Gets a key on a map and if it doesn't exist it inserts a new value, then returns the value.
export function getOrSet<Key, Value>(map: Map<Key, Value>, key: Key, fn: () => Value): Value {
	const value = map.get(key);
	if (value === undefined) {
		const insert = fn();
		map.set(key, insert);
		return insert;
	}
	return value;
}

// Creates a new instance of a class without calling the constructor, then copies the given
// properties on to it
export function instantiate<Type>(ctor: new(...params: any) => Type, properties: any): Type {
	return Object.assign(Object.create(ctor.prototype), properties);
}

// Attaches a listener to an EventEmitter and returns a lambda which removes the listener
type Emitter<Message, Listener> = {
	on: (message: Message, listener: Listener) => void;
	removeListener: (message: Message, listener: Listener) => void;
};
export function listen<
	Message extends string,
	Listener extends (...params: any[]) => void,
	Type extends Emitter<Message, Listener>,
>(emitter: Type, message: Message, listener: Listener) {
	emitter.on(message, listener);
	return () => emitter.removeListener(message, listener);
}

// Returns a promise and resolver functions in one
export function makeResolver<Type>(): [ Promise<Type>, Resolver<Type> ] {
	let resolver: Resolver<Type>;
	const promise = new Promise<Type>((resolve, reject) => resolver = { resolve, reject });
	return [ promise, resolver! ];
}

// It's like [].map except you can use it on iterables, also it doesn't generate a temporary array.
export function *mapInPlace<Type, Result>(iterable: Iterable<Type>, callback: (value: Type) => Result) {
	for (const value of iterable) {
		yield callback(value);
	}
}

// It's like the constructor for `Map` except it returns a plain Object
export function mapToKeys<Type, Key extends string | number | symbol, Value>(
	iterable: Iterable<Type>, callback: (value: Type) => [ Key, Value ],
) {
	const result: Record<Key, Value> = Object.create(null);
	for (const entry of iterable) {
		const [ key, value ] = callback(entry);
		result[key] = value;
	}
	return result;
}

// If you just want the smallest element of an array it's senseless to sort the whole thing and take
// array[0]. You can just run through once and find that element in linear time
export function minimum<Type>(iterable: Iterable<Type>, callback: (left: Type, right: Type) => number) {
	let first = true;
	let minimum: Type;
	for (const value of iterable) {
		if (first) {
			first = false;
			minimum = value;
		} else if (callback(minimum!, value) > 0) {
			minimum = value;
		}
	}
	return minimum!;
}

// Not nullable TS predicate
type NonNullOrVoidable<Type> = Type extends null | undefined | void ? never : Type;
export function nonNullable<Type>(value: Type): value is NonNullOrVoidable<Type> {
	return value != null;
}

// Object.assign but it throws if there's any key collisions
export function safeAssign(target: any, ...sources: any[]) {
	for (const source of sources) {
		for (const key of Object.keys(source)) {
			if (key in target) {
				throw new Error(`Key '${key}' already exists on object`);
			}
			target[key] = source[key];
		}
	}
}

// Used to inline upcast a value to another Type. This is *more* restrictive than `as Type`
export function staticCast<Type>(value: Type) {
	return value;
}
