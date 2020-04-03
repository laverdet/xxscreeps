declare module Express {
	// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
	export interface Request {
		provider?: string;
		userid?: string;
	}
}
