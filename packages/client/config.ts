// npx typescript-json-schema tsconfig.json ClientConfig --include ./config.ts --defaultProps --required -o ./config.schema.json
export interface ClientConfig {
	/**
	 * Configuration for '@xxscreeps/client'
	 */
	browserClient?: {
		/**
		 * Full path to `package.nw`. This has the following defaults:
		 * macOS: ~/Library/Application Support/Steam/steamapps/common/Screeps/package.nw
		 * Windows: C:\Program Files (x86)\Steam\steamapps\common\Screeps\package.nw
		 */
		package?: string;
	};
}

declare module 'xxscreeps/config/config.js' {
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface Config extends ClientConfig {}
}
