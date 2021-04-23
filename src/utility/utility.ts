import type { Implementation, Union } from './types';

// Wrapper around Object.assign that enforces assigned types already exist
export function assign<Result extends Base, Base = Result, Type extends Base = Base>(target: Result, source: Partial<Type>): Result {
	return Object.assign(target, source);
}

// Clamps a number to a given range
export function clamp(min: number, max: number, value: number) {
	return Math.max(min, Math.min(max, value));
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
type AddThis<Type, Fn> = Fn extends (...args: infer Args) => infer Return ?
	(this: Type, ...args: Args) => Return : Fn;
export function extend<Type, Proto extends {
	[Key in keyof Type]?: AddThis<Type, Type[Key]>;
}>(
	ctor: Implementation<Type>, proto: Proto | ((next: Type) => Proto),
) {
	const ext = typeof proto === 'function' ?
		proto(Object.getPrototypeOf(ctor.prototype)) : proto;
	for (const [ key, info ] of Object.entries(Object.getOwnPropertyDescriptors(ext))) {
		Object.defineProperty(ctor.prototype, key, info);
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
	list.splice(index, 1);
}

// Used to inline upcast a value to another Type. This is *more* restrictive than `as Type`
export function staticCast<Type>(value: Type) {
	return value;
}

// Accepts an instance function an returns a free function where the first argument becomes `this`
export function uncurryThis<This, Args extends any[], Return>(callback: (this: This, ...args: Args) => Return) {
	return (that: This, ...args: Args): Return => Reflect.apply(callback, that, args);
}

// Explodes a union type into all possible types inline
export function asUnion<Type>(value: Type): asserts value is Union<Type> {}
