import type { LooseBoolean } from './types';

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

// Given a series of effect-returning promises this waits for them all to resolve and returns a
// single effect that owns all the underlying effects. In the case that one throws the successful
// effects are destroyed.
type ActionResult<Result = any> = void | Cleanup | [ Cleanup | void, Result ];
type Cleanup = () => void;
type ARes<Type> =
	Type extends Promise<ActionResult<infer Result>> ? Result :
	Type extends ActionResult<infer Result> ? Result :
	void;
export function acquire<T1>(a1: T1): Promise<[ Effect, [ ARes<T1> ] ]>;
export function acquire<T1, T2>(a1: T1, a2: T2):
Promise<[ Effect, [ ARes<T1>, ARes<T2> ] ]>;
export function acquire<T1, T2, T3>(a1: T1, a2: T2, a3: T3):
Promise<[ Effect, [ ARes<T1>, ARes<T2>, ARes<T3> ] ]>;
export function acquire<T1, T2, T3, T4>(a1: T1, a2: T2, a3: T3, a4: T4):
Promise<[ Effect, [ ARes<T1>, ARes<T2>, ARes<T3>, ARes<T4> ] ]>;
export function acquire<Args extends Promise<ActionResult>[]>(...args: Args) {
	// Not implemented as an async function to keep original stack traces
	return new Promise((resolve, reject) => {
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		Promise.allSettled(args).then(settled => {
			const effects: Effect[] = [];
			const results: any[] = [];
			let rejected = false;
			for (const result of settled) {
				if (result.status === 'fulfilled') {
					const { value } = result;
					if (Array.isArray(value)) {
						// Returned `[ effect, result ]`
						const effect = value[0];
						if (effect) {
							effects.push(effect);
						}
						results.push(value[1]);
					} else {
						// Returned `effect`
						if (value) {
							effects.push(value);
						}
						results.push(undefined);
					}
				} else if (!rejected) {
					// Reject with first error found
					rejected = true;
					reject(result.reason);
				}
			}
			const effect = () => effects.forEach(effect => effect());
			if (rejected) {
				effect();
			} else {
				resolve([ effect, results ]);
			}
		});
	});
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
	iterable: Iterable<Type>): Iterable<NonNullOrVoidable<Filtered>>;
export function filterInPlace<Type, Filtered extends Type>(
	iterable: Iterable<Type>, callback: (value: Type) => value is Filtered): Iterable<Filtered>;
export function filterInPlace<Type>(
	iterable: Iterable<Type>, callback: (value: Type) => LooseBoolean): Iterable<Type>;
export function *filterInPlace(iterable: Iterable<any>, callback: (value: any) => LooseBoolean = nonNullable) {
	for (const value of iterable) {
		if (callback(value) as boolean) {
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
		if (callback(value) as boolean) {
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

function identity<Type>(any: Type) {
	return any;
}

// Creates a new instance of a class without calling the constructor, then copies the given
// properties on to it
export function instantiate<Type>(
	ctor: new(...params: any) => Type,
	properties: { [Key in keyof Type]?: Type[Key] },
): Type {
	return Object.assign(Object.create(ctor.prototype), properties);
}

// Attaches a listener to an EventEmitter and returns a lambda which removes the listener
type Emitter<Message, Listener> = {
	on: (message: Message, listener: Listener) => void;
	removeListener: (message: Message, listener: Listener) => void;
};
type Effect = () => void;
export function listen<
	Message extends string,
	Listener extends (...params: any[]) => void,
	Type extends Emitter<Message, Listener>,
>(emitter: Type, message: Message, listener: Listener): Effect {
	emitter.on(message, listener);
	return () => emitter.removeListener(message, listener);
}

// It's like [].map except you can use it on iterables, also it doesn't generate a temporary array.
export function *mapInPlace<Type, Result>(iterable: Iterable<Type>, callback: (value: Type) => Result): Iterable<Result> {
	for (const value of iterable) {
		yield callback(value);
	}
}

// It's like the constructor for `Map` except it returns a plain Object
export function mapToKeys<Type, Key extends string | number | symbol>(
	iterable: Iterable<[ Key, Type ]>): Record<Key, Type>;
export function mapToKeys<Type, Key extends string | number | symbol, Value>(
	iterable: Iterable<Type>, callback: (value: Type) => [ Key, Value ]): Record<Key, Value>;
export function mapToKeys<Type, Key extends string | number | symbol, Value>(
	iterable: Iterable<Type>, callback: (value: Type) => [ Key, Value ] = identity as any,
) {
	return Object.fromEntries(mapInPlace(iterable, callback));
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

// Used to inline upcast a value to another Type. This is *more* restrictive than `as Type`
export function staticCast<Type>(value: Type) {
	return value;
}

// Accepts an instance function an returns a free function where the first argument becomes `this`
export function uncurryThis<This, Args extends any[], Return>(callback: (this: This, ...args: Args) => Return) {
	return (that: This, ...args: Args): Return => Reflect.apply(callback, that, args);
}
