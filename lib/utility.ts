// Checks that a value can be casted to a type, but returns the original type. The curry thing here
// is needed because TypeScript doesn't support optional generic parameters
export function checkCast<Type>() {
	return <Value extends Type>(value: Value) => value;
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
export function filterInPlace(iterable: Iterable<any>, callback: (value: any) => LooseBoolean) {
	return function *() {
		for (const value of iterable) {
			if (callback(value)) {
				yield value;
			}
		}
	}();
}

// Creates a new instance of a class without calling the constructor, then copies the given
// properties on to it
export function instantiate<Type>(ctor: new(...params: any) => Type, properties: any): Type {
	return Object.assign(Object.create(ctor.prototype), properties);
}

// It's like [].map except you can use it on iterables, also it doesn't generate a temporary array.
export function mapInPlace<Type, Result>(iterable: Iterable<Type>, callback: (value: Type) => Result) {
	return function *() {
		for (const value of iterable) {
			yield callback(value);
		}
	}();
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

// Used to inline upcast a value to another Type. This is *more* restrictive than `as Type`
export function staticCast<Type>(value: Type) {
	return value;
}
