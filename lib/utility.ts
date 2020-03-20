// Replace a value on an object with a new one, and returns the old one.
export function exchange<Target extends object, Name extends keyof Target>(
		target: Target, name: Name, newValue?: Target[Name]) {
	const value = target[name];
	target[name] = newValue!;
	return value;
}

// It's like [].map except you can use it on iterables, also it doesn't generate a temporary array.
export function mapInPlace<Type, Result>(iterable: Iterable<Type>, callback: (value: Type) => Result) {
	return function *() {
		for (const value of iterable) {
			yield callback(value);
		}
	}();
}

// Used to inline upcast a value to another Type. This is *more* restrictive than `as Type`
export function staticCast<Type>(value: Type) {
	return value;
}
