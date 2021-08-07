import * as Fn from 'xxscreeps/utility/functional';
import { isPrivate, makeSymbol } from 'xxscreeps/driver/private/symbol'; // Use full path for webpack rewrite
import { getOrSet } from 'xxscreeps/utility/utility';
const { apply, defineProperty, get, getPrototypeOf, set } = Reflect;
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

export function getOwnPrivateEntries(object: any) {
	if (isPrivate) {
		return Fn.map(
			Fn.filter(symbols.values(), symbol => symbol in object),
			symbol => [ symbol, object[symbol] ],
		);
	} else {
		return [];
	}
}

export function makeGetter(name: string, optional: boolean): (object: any) => any {
	const symbol = getSymbol(name);
	return asOptional(optional, () => {
		if (inherits) {
			return object => object[symbol];
		} else {
			return object => {
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

export function makeSetter(name: string): (object: any, value: any) => any {
	const symbol = getSymbol(name);
	if (inherits) {
		return (object, value) => object[symbol] = value;
	} else {
		return (object, value) => {
			if (symbol in object) {
				return object[symbol] = value;
			}
			for (let instance = getPrototypeOf(object); instance !== null; instance = getPrototypeOf(instance)) {
				if (symbol in instance) {
					set(instance, symbol, value, object);
					return value;
				}
			}
			defineProperty(object, symbol, {
				get() { return value },
				set(value) {
					defineProperty(this, symbol, {
						writable: true,
						value,
					});
				},
			});
			return value;
		};
	}
}

export function makeMutator(name: string, postfix = false): (object: any, fn: (value: any) => any) => any {
	const get = makeGetter(name, false);
	const set = makeSetter(name);
	if (postfix) {
		return (object, fn) => {
			const value = get(object);
			set(object, fn(value));
			return value;
		};
	} else {
		return (object, fn) => set(object, fn(get(object)));
	}
}

export function makeInvoke(name: string, optional: boolean, isSuper = false): (object: any, ...args: any[]) => any {
	const symbol = getSymbol(name);
	return asOptional(optional, () => {
		if (inherits) {
			if (isSuper) {
				return (object, ...args) => apply((getPrototypeOf(getPrototypeOf(object)!) as any)[symbol], object, args);
			} else {
				return (object, ...args) => apply(object[symbol], object, args);
			}
		} else {
			// eslint-disable-next-line no-lonely-if
			if (isSuper) {
				return (object, ...args) => {
					for (let instance = getPrototypeOf(getPrototypeOf(object)!); instance !== null; instance = getPrototypeOf(instance)) {
						if (symbol in instance) {
							return apply((instance as any)[symbol], object, args);
						}
					}
					throw new Error(`${symbol.description} is undefined`);
				};
			} else {
				return (object, ...args) => {
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
