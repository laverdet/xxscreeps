export {}; // fake module

declare global {
	// Converts a type to a newable type
	type Constructor<Type> =
	Type extends new(...args: infer Params) => infer Instance ?
		new(...args: Params) => Instance :
		new(...args: any[]) => Type;

	// Same as `Record` but has nullable members
	type Dictionary<Type> = {
		[key in string]?: Type;
	};

	// Public Promise
	type Resolver<Type = unknown> = {
		resolve: (payload: Type) => void;
		reject: (payload: Error) => void;
	};
}
