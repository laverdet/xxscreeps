// npx typescript-json-schema tsconfig.json Schema --include ./src/config/schema.ts --defaultProps --required -o ./src/config/config.schema.json
export type Schema = {
	/**
	 * Backend server settings
	 */
	backend?: {
		/**
		 * Network interface to bind server to. Format is: "host" or "host:port". Host can be * to bind
		 * to all interfaces: "*:port". Port is 21025, if not specified.
		 * @default localhost
		 */
		bind?: string;

		/**
		 * Whether to allow read only access to the API without logging in.
		 * @default true
		 */
		allowGuestAccess?: boolean;

		/**
		 * Secret used for session authentication. If not specified a new secret will be generated each
		 * restart.
		 */
		secret?: string;

		/**
		 * Steam Web API key used to authenticate users. You can get a key here:
		 * http://steamcommunity.com/dev/apikey
		 */
		steamApiKey?: string;
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
		 * @default `os.cpus().length + 1`
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
	mods?: string[];

	/**
	 * Runner settings
	 */
	runner?: {
		/**
		 * Total number of runner tasks to run at a time.
		 * @default `os.cpus().length + 1`
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
	 * Where to save descriptions of the binary format used to write game data.
	 * @default ./screeps/archive
	 */
	schemaArchive?: string | undefined;

	/**
	 * Configuration for global database storage
	 */
	database?: {
		/**
		 * Blob storage provider URI
		 * @default ./screeps/db
		 */
		blob: string;

		/**
		 * Persistent storage provider URI
		 * @default ./screeps/db/data.json
		 */
		data: string;

		/**
		 * Pubsub storage provider URI
		 * @default local://db
		 */
		pubsub: string;
	};

	/**
	 * Configuration for shard-specific storage
	 * @default `[ {
	 *   name: 'shard0',
	 *   blob: './screeps/shard0',
	 *   data: './screeps/shard0/data.json',
	 *   pubsub: 'local://shard0',
	 *   scratch: 'local://shard0',
	 * } ]`
	 */
	shards?: {
		/**
		 * Name of this shard
		 */
		name: string;

		/**
		 * Blob storage provider URI
		 */
		blob: string;

		/**
		 * Persistent storage provider URI
		 */
		data: string;

		/**
		 * Pubsub storage provider URI
		 */
		pubsub: string;

		/**
		 * Temporary storage provider URI
		 */
		scratch: string;
	}[];
};
