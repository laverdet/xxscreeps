export type Schema = {
	/**
	 * Backend server settings
	 */
	backend: {
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
	 * Runner settings
	 */
	runner?: {
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
