export function lateCallback<Result, Args extends any[]>(fn: () => (...args: Args) => Result) {
	const callback = runOnce(fn);
	return (...args: Args) => callback()(...args);
}

export function runOnce<Type>(fn: () => Type): () => Type {
	let getter = () => {
		const value = fn();
		getter = () => value;
		return value;
	};
	return () => getter();
}
