// npx typescript-json-schema tsconfig.json Schema --include ./src/config.ts --defaultProps --required -o ./src/config.schema.json
export type Schema = {
	/**
	 * Configuration for '@xxscreeps/client'
	 */
	browserClient?: {
		/**
		 * Full path to `package.nw`. If unset, @xxscreeps/client searches Steam's default
		 * library roots and `libraryfolders.vdf` for Screeps.
		 */
		package?: string;
	};
};
