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
