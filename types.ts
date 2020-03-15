export {}; // fake module

declare global {
	// Same as `Record` but has nullable members
	type Dictionary<Type> = {
		[key in string]?: Type;
	};
}
