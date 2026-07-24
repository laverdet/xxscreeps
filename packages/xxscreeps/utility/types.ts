// Returns the type of `this` on a given function, which is completely different than TypeScript's `ThisType`
export type ContextType<Function extends (...args: any) => any> =
	Function extends (this: infer Type, ...args: any) => any ? Type : never;

// Like `Extract` but flipped. Extract<{ a:1 }, { a:1;b:1 }> -> never  ::  CounterExtract<{ a:1 }, { a:1;b:1 }> -> { a:1 }
export type CounterExtract<T, U> = T extends any ? U extends T ? T : never : never;

// Same as `Record` but has nullable members
export type Dictionary<Type> = Partial<Record<string, Type>>;

// A non-null object which allows access to any property
export type UnknownObject = Record<string, unknown>;

// Returns all keys of a union type
export type KeysOf<Type> = Type extends any ? keyof Type : never;

// Returns value of key from any member in a union
export type KeyFor<Type, Key extends keyof any> = Extract<Type, WithKey<Key>>[Key];

// React style unlistener
export type Effect = () => void;
export type EffectWithResult<Type = unknown> = readonly [ Effect | undefined, Type ] | undefined;
export type AsyncEffectAndResult<Type = unknown> = MaybePromise<EffectWithResult<Type>> | undefined;

// Helper for passing around prototypes
export interface Implementation<Type extends object> { prototype: Type }
export interface Instantiable<Type extends object, Params extends unknown[] = any[]> extends Implementation<Type> {
	new(...params: Params): Type;
}

// Type that's safe to loosely compare to true/false without weirdness like '' or NaN or 0
export type LooseBoolean = boolean | object | null | undefined;

// Either a promise or not a promise..
export type MaybePromise<Type> = Type | Promise<Type>;

// For functions that accept an array or just one element
export type OneOrMany<Type> = Type | Type[];

// Allow access to any property on a union
export type Union<T, K extends keyof any = T extends any ? keyof T : never> =
	T extends any ? T & Partial<Record<Exclude<K, keyof T>, never>> : never;

// Converts T | U to T & U
export type UnionToIntersection<Union> =
	(Union extends any ? (key: Union) => void : never) extends ((key: infer Intersection) => void) ? Intersection : never;

// Returns an object with a given key
export type WithKey<Path extends keyof any> = Record<Path, any>;
