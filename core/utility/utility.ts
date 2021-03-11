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
export function exchange<Target extends {}, Name extends keyof Target>(
		target: Target, name: Name, newValue?: Target[Name]) {
	const value = target[name];
	if (newValue !== undefined || name in target) {
		target[name] = newValue!;
	}
	return value;
}

// Wrapper around `Object.assign` which brings in type information from the interface being extended
type AddThis<Type, Fn> = Fn extends (...args: infer Args) => infer Return ?
	(this: Type, ...args: Args) => Return : never;
export function extend<Type, Proto extends {
	[Key in keyof Type]?: AddThis<Type, Type[Key]>;
}>(
	ctor: Implementation<Type>, proto: Proto | ((next: Type) => Proto),
) {
	const ext = typeof proto === 'function' ?
		proto(Object.getPrototypeOf(ctor.prototype)) : proto;
	Object.assign(ctor.prototype, ext);
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
