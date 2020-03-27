export function RecursiveWeakMemoize<Type extends (...args: any[]) => any>(indices: number[], generator: Type): Type;
export function RecursiveWeakMemoize(indices: number[], generator: (...args: any[]) => any) {
	const map = new WeakMap;
	const last = indices.length - 1;
	return function(this: any, ...args: any[]) {
		// Check cached results, making WeakMaps as needed
		let result: typeof map | undefined = map;
		for (let ii = 0; ii < last; ++ii) {
			const arg = args[indices[ii]];
			if (typeof arg !== 'object') {
				result = undefined;
				break;
			}
			if (result!.has(arg)) {
				result = result!.get(arg);
			} else {
				const next = new WeakMap;
				result!.set(arg, next);
				result = next;
			}
		}

		// Return cached result, or generate and save
		const arg = args[indices[last]];
		if (typeof arg === 'object') {
			const cached = result?.get(arg);
			if (cached !== undefined) {
				return cached;
			}
			const value = Reflect.apply(generator, this, args);
			result?.set(arg, value);
			return value;
		}
		return Reflect.apply(generator, this, args);
	};
}

export function runOnce<Type extends object>(fn: () => Type): () => Type {
	let cached: Type | undefined;
	return () => {
		if (cached) {
			return cached;
		} else {
			return cached = fn();
		}
	};
}
