declare module 'xxscreeps:backend' {
	interface Context {
		authenticateForProvider: (provider: string, providerId: string) => Promise<string>;
		flushToken: (initializeGuest?: boolean) => Promise<string | undefined>;
	}
	interface State {
		newUserId?: string | undefined;
		userId?: string | undefined;
		provider?: string | undefined;
		providerId?: string | undefined;
		token?: string | undefined;
	}
}
