globalThis.enumerable = (target: any, key: string, descriptor: PropertyDescriptor) => ({ ...descriptor, enumerable: true });

export function flushGlobals() {
	const global: any = globalThis;
	delete global.enumerable;
}
