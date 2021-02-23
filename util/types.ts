// Returns the type of `this` on a given function, which is completely different than TypeScript's `ThisType`
export type ContextType<Function extends (...args: any) => any> =
	Function extends (this: infer Type, ...args: any) => any ? Type : never;

// Returns all keys of a union type
export type KeysOf<Type> = Type extends Type ? keyof Type : never;

// Returns index of key from any member in a union
export type KeyFor<Type, Key extends number | string | symbol> = Extract<Type, { [key in Key]: any }>[Key];

// Returns `Type`, or `Fallback` if `Type` was never. TODO: Figure out how to make this reliable
export type Fallback<Type, Fallback> = (Type | Fallback) extends Fallback ? Fallback : Type;

// Helper for passing around prototypes
export type Implementation<Type> = { prototype: Type };
