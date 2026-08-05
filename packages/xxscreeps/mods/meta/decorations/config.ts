export interface DecorationsSettings {
	/**
	 * Prefix put in front of decoration asset urls, which are otherwise rooted at `/`. Needed when
	 * the backend does not sit at the root of the origin the client is served from: an origin of its
	 * own, e.g. "https://screeps.example.com", or the path a proxy mounts it under, e.g.
	 * "/(http://localhost:21025)" for the steamless client. Prepended verbatim, so it takes either.
	 */
	assetBaseUrl?: string;

	/**
	 * Whether to load the decoration pack bundled with the server.
	 * @default true
	 */
	builtin?: boolean;

	/**
	 * Whether every user owns the whole decoration catalog. With this off, decorations must be
	 * handed out explicitly with `xxscreeps manage decoration grant`.
	 * @default true
	 */
	grantAll?: boolean;

	/**
	 * Additional decoration packs to load. Each entry is a path to a `pack.json`, or to the
	 * directory holding one.
	 */
	packs?: string[];

	/**
	 * Whether placing a decoration requires the player to control or reserve the room.
	 * @default true
	 */
	requireRoomOwnership?: boolean;
}

export interface DecorationsConfig {
	/**
	 * Room decoration settings
	 */
	decorations?: DecorationsSettings;
}

declare module 'xxscreeps/config/config.js' {
	interface Config extends DecorationsConfig {}
}
