// Converts a type to a newable type
export type Constructor<Type> =
Type extends new(...args: infer Params) => infer Instance ?
	new(...args: Params) => Instance :
	new(...args: any[]) => Type;

// Returns the type of `this` on a given function, which is completely different than TypeScript's `ThisType`
export type ContextType<Function extends (...args: any) => any> =
	Function extends (this: infer Type, ...args: any) => any ? Type : never;

// Like `Extract` but flipped. Extract<{ a:1 }, { a:1;b:1 }> -> never  ::  CounterExtract<{ a:1 }, { a:1;b:1 }> -> { a:1 }
export type CounterExtract<T, U> = T extends any ? U extends T ? T : never : never;

// Same as `Record` but has nullable members
export type Dictionary<Type> = {
	[key in string]?: Type;
};

// Returns all keys of a union type
export type KeysOf<Type> = Type extends any ? keyof Type : never;

// Returns value of key from any member in a union
export type KeyFor<Type, Key extends keyof any> = Extract<Type, { [key in Key]: any }>[Key];

// Returns `Type`, or `Fallback` if `Type` was never. TODO: Figure out how to make this reliable
export type Fallback<Type, Fallback> = (Type | Fallback) extends Fallback ? Fallback : Type;

// Helper for passing around prototypes
export type Implementation<Type = {}> = { prototype: Type };

// Type that's safe to loosely compare to true/false without weirdness like '' or NaN or 0
export type LooseBoolean = boolean | object | null | undefined;

// For functions that accept an array or just one element
export type OneOrMany<Type> = Type | Type[];

// Excludes from a union only *exact* types. Exclude<1, number> -> never  ::  StrictExclude<1, number> -> 1
export type StrictExclude<T, U> = T extends any ? T extends U ? U extends T ? never : T : T : never;

// Converts T | U to T & U
export type UnionToIntersection<Union> =
	(Union extends any ? (key: Union) => void : never) extends ((key: infer Intersection) => void) ? Intersection : never;

// Turns `T[]` into `T`, or returns `T` if it's not an array
export type UnwrapArray<Type> = Type extends (infer Element)[] ? Element : Type;
