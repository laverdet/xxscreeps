// npx typescript-json-schema tsconfig.json Schema --include ./core/config/schema.ts --defaultProps --required -o ./core/config/config.schema.json
export type Schema = {
	/**
	 * Backend server settings
	 */
	backend: {
		/**
		 * Secret used for session authentication. If not specified a new secret will be generated each
		 * restart.
		 */
		secret?: string;

		/**
		 * Steam Web API key used to authenticate users. You can get a key here:
		 * http://steamcommunity.com/dev/apikey
		 */
		steamApiKey: string;
	};

	/**
	 * Game settings
	 */
	game?: {
		/**
		 * Minimum length of a game tick in milliseconds.
		 * @default 250
		 */
		tickSpeed?: number;
	};

	/**
	 * Launcher settings
	 */
	launcher?: {
		/**
		 * Total number of processors to create.
		 * @default 2
		 */
		processorWorkers?: number;

		/**
		 * Total number of runners to create. It's best to leave this at 1 because runner will create
		 * its own threads.
		 * @default 1
		 */
		runnerWorkers?: number;

		/**
		 * Set true to run all services in a single nodejs isolate. This does *not* affect the runner's
		 * isolates.
		 * @default false
		 */
		singleThreaded?: boolean;
	};

	/**
	 * List of mods to load
	 */
	mods: string[];

	/**
	 * Runner settings
	 */
	runner?: {
		/**
		 * Total number of runner tasks to run at a time. The default is `os.cpus().length + 1`.
		 */
		concurrency?: number;

		/**
		 * Setting this to true will run user code using the nodejs `vm` module instead
		 * of `isolated-vm`. Do not enable this on public servers!
		 * @default false
		 */
		unsafeSandbox?: boolean;
	};

	/**
	 * Configuration for local storage
	 */
	storage?: {
		/**
		 * Path to save game state, relative to this configuration file.
		 * @default: ./data
		 */
		path?: string;
	};
};
