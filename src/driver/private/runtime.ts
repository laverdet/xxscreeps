import * as Fn from 'xxscreeps/utility/functional';
import { isPrivate, makeSymbol } from 'xxscreeps/driver/private/symbol'; // Use full path for webpack rewrite
import { getOrSet } from 'xxscreeps/utility/utility';
const { apply, get, getPrototypeOf, set } = Reflect;
const inherits = function(): boolean {
	// v8 private symbols don't follow prototype chain. This tests the implementation's behavior.
	const symbol = makeSymbol();
	const test = { [symbol]: true };
	return Object.create(test)[symbol] ?? false;
}();

function asOptional(optional: boolean, factory: () => (...args: any[]) => any) {
	const fn = factory();
	if (optional) {
		return (...args: any[]) => {
			if (args[0]) {
				return apply(fn, undefined, args);
			}
		};
	} else {
		return fn;
	}
}

const symbols = new Map<string, symbol>();
export function getSymbol(name: string) {
	return getOrSet(symbols, name, () => makeSymbol(name));
}

export function ownPrivateEntries(object: any) {
	if (isPrivate) {
		return Fn.map(
			Fn.filter(symbols.values(), symbol => symbol in object),
			symbol => [ symbol, object[symbol] ],
		);
	} else {
		return [];
	}
}

export function makeGetter(name: string, optional: boolean) {
	const symbol = getSymbol(name);
	return asOptional(optional, () => {
		if (inherits) {
			return (object: any) => object[symbol];
		} else {
			return (object: any) => {
				if (symbol in object) {
					return object[symbol];
				}
				for (let instance = getPrototypeOf(object); instance !== null; instance = getPrototypeOf(instance)) {
					if (symbol in instance) {
						// This only works for getters. Inherited non-getter properties should not be used.
						return get(instance, symbol, object);
					}
				}
			};
		}
	});
}

export function makeSetter(name: string) {
	const symbol = getSymbol(name);
	if (inherits) {
		return (object: any, value: any) => object[symbol] = value;
	} else {
		return (object: any, value: any) => {
			for (let instance = object; instance !== null; instance = getPrototypeOf(instance)) {
				if (symbol in instance) {
					set(instance, symbol, value, object);
					return value;
				}
			}
			set(object, symbol, value);
			return value;
		};
	}
}

export function makeInvoke(name: string, optional: boolean, isSuper = false) {
	const symbol = getSymbol(name);
	return asOptional(optional, () => {
		if (inherits) {
			if (isSuper) {
				return (object: any, ...args: any[]) => apply((getPrototypeOf(getPrototypeOf(object)!) as any)[symbol], object, args);
			} else {
				return (object: any, ...args: any[]) => apply(object[symbol], object, args);
			}
		} else {
			// eslint-disable-next-line no-lonely-if
			if (isSuper) {
				return (object: any, ...args: any[]) => {
					for (let instance = getPrototypeOf(getPrototypeOf(object)!); instance !== null; instance = getPrototypeOf(instance)) {
						if (symbol in instance) {
							return apply((instance as any)[symbol], object, args);
						}
					}
					throw new Error(`${symbol.description} is undefined`);
				};
			} else {
				return (object: any, ...args: any[]) => {
					for (let instance = object; instance !== null; instance = getPrototypeOf(instance)) {
						if (symbol in instance) {
							return apply(instance[symbol], object, args);
						}
					}
					throw new Error(`${symbol.description} is undefined`);
				};
			}
		}
	});
}
