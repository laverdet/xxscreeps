import type { Effect, LooseBoolean, Union } from './types.js';
import { mustNotReject } from './async.js';

// Wrapper around Object.assign that enforces assigned types already exist
export function assign<
	Result extends Base,
	Base extends Record<any, any> = Result,
	Type extends Base = Base,
>(target: Result, source: Partial<Type>): Result {
	return Object.assign(target, source);
}

// Combination filter + reject
export function bifurcate<Type, Yes extends Type, No = Exclude<Type, Yes>>(
	iterator: Iterable<Type>, callback: (value: Type) => value is Yes): [ Yes[], No[] ];
export function bifurcate<Type>(iterator: Iterable<Type>, callback: (value: Type) => LooseBoolean): [ Type[], Type[] ];
export function bifurcate(iterator: Iterable<any>, callback: (value: any) => LooseBoolean) {
	const yes: any[] = [];
	const no: any[] = [];
	for (const value of iterator) {
		if (callback(value)) {
			yes.push(value);
		} else {
			no.push(value);
		}
	}
	return [ yes, no ];
}

// Clamps a number to a given range
export function clamp(min: number, max: number, value: number) {
	return Math.max(min, Math.min(max, value));
}

// Convert a Disposable to a plain 'Effect'
export function disposableToEffect(disposable: Disposable) {
	const dispose = disposable[Symbol.dispose];
	return () => dispose.call(disposable);
}

// Convert an AsyncDisposable to a plain `Effect` (which must not reject)
export function asyncDisposableToEffect(disposable: AsyncDisposable): Effect {
	const dispose = disposable[Symbol.asyncDispose];
	return () => mustNotReject(dispose.call(disposable));
}

// Replace a value on an object with a new one, and returns the old one.
export function exchange<T, N extends keyof T>(
	target: T, name: N,
	...newValue: undefined extends T[N] ? [ T[N]? ] : [ T[N] ]): T[N];
export function exchange(target: any, name: keyof any, newValue: any = undefined) {
	const value = target[name];
	target[name] = newValue;
	return value;
}

// Wrapper around `Object.assign` which brings in type information from the interface being extended
type AddThis<Type, Fn> = Fn extends (...args: infer Args) => infer Return
	? (this: Type, ...args: Args) => Return : {
		configurable?: boolean;
		enumerable?: boolean;
		writable?: boolean;
		get?: (this: Type) => any;
		set?: (this: Type, value: any) => void;
		value?: any;
	};
export function extend<Type, Proto extends {
	[Key in keyof Type]?: AddThis<Type, Type[Key]>;
}>(ctor: abstract new (...args: any[]) => Type, proto: Proto | ((next: Type) => Proto)) {
	const ext = typeof proto === 'function'
		? proto(Object.getPrototypeOf(ctor.prototype)) : proto;
	for (const [ key, info ] of Object.entries(Object.getOwnPropertyDescriptors(ext))) {
		if (info.value && typeof info.value === 'function') {
			Object.defineProperty(ctor.prototype, key, { ...info, enumerable: false });
		} else {
			Object.defineProperty(ctor.prototype, key, info.value);
		}
	}
}

// Remove all elements from an array which don't match the predicate.
export function filterInPlace<Type>(array: Type[], fn: (value: Type) => boolean) {
	let cursor = array.length - 1;
	for (let ii = cursor; ii >= 0; --ii) {
		if (!fn(array[ii])) {
			array[ii] = array[cursor--];
		}
	}
	array.splice(cursor + 1);
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
export function instantiate<Type>(
	ctor: new(...params: any) => Type,
	properties: { [Key in keyof Type]?: Type[Key] },
): Type {
	return Object.assign(Object.create(ctor.prototype), properties);
}

export function merge(result: any, subject: any) {
	for (const [ key, val ] of Object.entries(subject)) {
		if (val === null) {
			result[key] = null;
		} else if (
			result[key] == null ||
			typeof val !== 'object'
		) {
			result[key] = val;
		} else {
			merge(result[key], val);
		}
	}
}

export function removeOne<Type>(list: Type[], element: Type) {
	const index = list.indexOf(element);
	if (index === -1) {
		throw new Error('Element was not found');
	}
	list[index] = list[list.length - 1];
	list.pop();
}

export function throttle(fn: () => void) {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	return {
		clear() {
			if (timeout) {
				clearTimeout(timeout);
				timeout = undefined;
			}
		},
		reset(time: number) {
			this.clear();
			this.set(time);
		},
		set(time: number) {
			timeout ||= setTimeout(() => {
				timeout = undefined;
				fn();
			}, time);
		},
	};
}

// Disposable timeout, clears on scope exit with `using`
export function acquireTimeout(timeout: number, fn: () => void) {
	let handle: NodeJS.Timeout | undefined = setTimeout(
		() => {
			handle = undefined;
			fn();
		},
		timeout,
	);
	return {
		[Symbol.dispose]() {
			if (handle) {
				clearTimeout(handle);
			}
		},
	};
}

// Explodes a union type into all possible types inline
export function asUnion<Type>(_value: Type): asserts _value is Union<Type> {}

// There are some cases where an array type is required but an iterable is all you have. This just
// forces the type to be that.
export function hackyIterableToArray<Type>(value: Iterable<Type>): asserts value is Type[] {
	return value as never;
}
