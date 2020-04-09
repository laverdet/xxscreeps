/**
 * Returns a new object with inherited getters expanded as own properties. This is used for console
 * logging since the bulk of useful information on game objects is in the form of getters.
 */
export function expandGetters(that: any) {
	// Find inherited getters
	const proto = Object.getPrototypeOf(that);
	const ownProperties = Object.getOwnPropertyNames(that);
	const keys: string[] = [];
	let protoChain = proto;
	do {
		const descriptors = Object.getOwnPropertyDescriptors(protoChain);
		for (const [ key, descriptor ] of Object.entries(descriptors)) {
			if (
				descriptor.get &&
				descriptor.configurable &&
				!ownProperties.includes(key)
			) {
				keys.push(key);
			}
		}
		protoChain = Object.getPrototypeOf(protoChain);
	} while (protoChain !== Object.prototype);

	// Build object with inherited getters expanded
	if (keys.length === 0) {
		return that;
	}
	const expanded = Object.create(that);
	keys.push(...ownProperties);
	keys.sort();
	for (const key of keys) {
		const value = that[key];
		if (value != null) {
			Object.defineProperty(expanded, key, { enumerable: true, writable: true, value });
		}
	}
	// Don't recurse
	Object.defineProperty(expanded, Symbol.for('nodejs.util.inspect.custom'), {});
	return expanded;
}
