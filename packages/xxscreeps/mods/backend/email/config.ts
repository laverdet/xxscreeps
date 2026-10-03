export interface EmailSettings {
	/**
	 * Whether email addresses are trusted immediately on registration/change, rather than held
	 * pending until the user opens a confirmation link. Turning this off needs `backend.publicUrl`
	 * set and a mod which delivers mail; without either, addresses are held pending with no way to
	 * confirm them. Note that an address held pending is not yet a sign-in identity — until it is
	 * confirmed the user signs in by username.
	 * @default true
	 */
	autoVerify?: boolean;

	/**
	 * Where the backend sends a user's browser after they open an address confirmation link. The
	 * outcome is appended as `emailVerified=1` or `emailVerified=0`, so the destination can report
	 * it. Defaults to the server root, which is the client on a stock install; point it elsewhere
	 * when the client is served from another origin.
	 * @default /
	 */
	verifyRedirect?: string;
}

export interface EmailConfig {
	/**
	 * Email address settings
	 */
	email?: EmailSettings;
}

declare module 'xxscreeps/config/config.js' {
	interface Config extends EmailConfig {}
}
