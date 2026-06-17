// This is not an ambient context.
export {};

declare module 'isolated-vm' {
	interface Lib {
		privateSymbol: (name?: string) => symbol;
	}
	const lib: Lib;
}
