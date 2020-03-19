export function makeResolver<Type>(): [ Promise<Type>, Resolver<Type> ] {
	let resolver: Resolver<Type>;
	const promise = new Promise<Type>((resolve, reject) => resolver = { resolve, reject });
	return [ promise, resolver! ];
}
