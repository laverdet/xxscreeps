import { Fn } from 'xxscreeps/functional/fn.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';
import { isPrivate, makeSymbol } from 'xxscreeps:private-symbol';

type Subject = Record<keyof any, unknown>;
type Prototype = { prototype: Subject };
type AnyFunction = (...args: unknown[]) => unknown;

const { apply, defineProperty, get, getPrototypeOf, ownKeys, set } = Reflect;
const inherits = function() {
	// v8 private symbols don't follow prototype chain. This tests the implementation's behavior.
	const symbol = makeSymbol();
	const test = { [symbol]: true };
	const value = Object.create(test) satisfies object as Record<keyof any, boolean>;
	return value[symbol] ?? false;
}();

function asOptional<Result, Args extends unknown[]>(optional: boolean | undefined, fn: (...args: Args) => Result) {
	if (optional) {
		return (...args: Args): Result | undefined => {
			if (args[0]) {
				return apply(fn, undefined, args);
			}
		};
	} else {
		return fn;
	}
}

const symbols = new Map<string, symbol>();
export function getSymbol(name: string): symbol {
	return getOrSet(symbols, name, () => makeSymbol(name));
}

export const ownKeysIncludingPrivate = function(): <Type extends Subject>(object: Type) => Iterable<keyof Type, undefined> {
	// nb: `inherits == !isPrivate` but this is unspecified and v8 is allowed to change it.
	if (isPrivate) {
		return object => Fn.concat([ ownKeys(object), Fn.filter(symbols.values(), symbol => symbol in object) ]);
	} else {
		return ownKeys;
	}
}();

export function *ownValuesIncludingPrivate<Type extends Subject>(object: Type): IteratorObject<Type[keyof Type], undefined> {
	for (const key of ownKeysIncludingPrivate(object)) {
		yield object[key];
	}
}

export function *ownEntriesIncludingPrivate<Type extends Subject>(object: Type): IteratorObject<[ keyof Type, Type[keyof Type] ], undefined> {
	for (const key of ownKeysIncludingPrivate(object)) {
		yield [ key, object[key] ];
	}
}

export function makeGetterFromSymbol(key: symbol): (object: Subject) => unknown {
	if (inherits) {
		return object => object[key];
	} else {
		return (object): unknown => {
			if (key in object) {
				return object[key];
			}
			for (let instance = getPrototypeOf(object); instance !== null; instance = getPrototypeOf(instance)) {
				if (key in instance) {
					// This only works for getters. Inherited non-getter properties should not be used.
					return get(instance, key, object);
				}
			}
		};
	}
}

export function makeGetter(name: string, optional?: boolean): (object: Subject) => unknown {
	const symbol = getSymbol(name);
	return asOptional<unknown, [ Subject ]>(optional, makeGetterFromSymbol(symbol));
}

export function makeSetter(name: string): (object: Subject, value: unknown) => unknown {
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
				get() { return value; },
				set(this: object, value) {
					defineProperty(this, symbol, {
						value,
						writable: true,
					});
				},
			});
			return value;
		};
	}
}

export function makeMutator(name: string, postfix = false): (object: Subject, fn: (value: unknown) => unknown) => unknown {
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

export function makeInvoke(name: string, optional?: boolean): (object: Subject, ...args: unknown[]) => unknown {
	const symbol = getSymbol(name);
	return asOptional(optional, function() {
		if (inherits) {
			return (object, ...args) => apply(object[symbol] as AnyFunction, object, args);
		} else {
			return (object, ...args) => {
				for (let instance: object | null = object; instance !== null; instance = getPrototypeOf(instance)) {
					if (symbol in instance) {
						const parent = instance satisfies object as Subject;
						return apply(parent[symbol] as AnyFunction, object, args);
					}
				}
				throw new Error(`${symbol.description} is undefined`);
			};
		}
	}());
}

export function makeSuperInvoke(name: string, optional?: boolean): (home: object, object: unknown, ...args: unknown[]) => unknown {
	const symbol = getSymbol(name);
	return asOptional(optional, function() {
		if (inherits) {
			return (home, object, ...args) => {
				const { prototype } = getPrototypeOf(home)! satisfies object as Prototype;
				return apply(prototype[symbol] as AnyFunction, object, args);
			};
		} else {
			return (home, object, ...args) => {
				for (let instance = getPrototypeOf(home); instance !== null; instance = getPrototypeOf(instance)) {
					const { prototype } = instance satisfies object as Prototype;
					if (symbol in prototype) {
						return apply(prototype[symbol] as AnyFunction, object, args);
					}
				}
				throw new Error(`${symbol.description} is undefined`);
			};
		}
	}());
}
