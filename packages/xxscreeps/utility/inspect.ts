const inspectSymbol = Symbol.for('nodejs.util.inspect.custom');

/**
 * Returns a new object with inherited getters expanded as own properties. This is used for console
 * logging since the bulk of useful information on game objects is in the form of getters.
 */
export function expandGetters(that: object) {
	// Find inherited getters
	const keys = Object.getOwnPropertyNames(that);
	for (let proto: unknown = Object.getPrototypeOf(that); proto !== null; proto = Object.getPrototypeOf(proto)) {
		for (const key of Object.getOwnPropertyNames(proto)) {
			if (key.startsWith('__') || key === 'constructor') {
				continue;
			}
			const descriptor = Object.getOwnPropertyDescriptor(proto, key)!;
			if (descriptor.get && descriptor.enumerable && !keys.includes(key)) {
				// Enumerability is intentionally inherited
				keys.push(key);
			}
		}
	}

	// Build object with inherited getters expanded
	const expanded: unknown = Object.create(that);
	keys.sort();
	for (const key of keys) {
		try {
			// @ts-expect-error
			const value: unknown = that[key];
			if (value !== undefined) {
				Object.defineProperty(expanded, key, { enumerable: true, writable: true, value });
			}
		} catch {}
	}

	// Don't recurse
	Object.defineProperty(expanded, inspectSymbol, {});
	return expanded;
}
