declare module 'xxscreeps:private-symbol' {
	export const isPrivate: boolean;
	export const makeSymbol: (name?: string) => symbol;
}
