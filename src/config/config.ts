import crypto from 'crypto';
import os from 'os';

// npx typescript-json-schema tsconfig.json Schema --include ./src/config/config.ts --defaultProps --required -o ./src/config/config.schema.json
export type Schema = {
	/**
	 * List of mods to load
	 */
	mods?: string[];

	/**
	 * Backend server settings
	 */
	backend?: {
		/**
		 * Whether to allow read-only access to the API without logging in.
		 * @default true
		 */
		allowGuestAccess?: boolean;

		/**
		 * Network interface to bind server to. Format is: "host" or "host:port". Host can be * to bind
		 * to all interfaces: "*:port". Port is 21025, if not specified.
		 * @default *
		 */
		bind?: string;

		/**
		 * Secret used for session authentication. If not specified a new secret will be generated each
		 * restart.
		 */
		secret?: string;

		/**
		 * Minimum time between socket updates, in milliseconds. Setting this lower may cause
		 * performance issues in the client.
		 * @default 125
		 */
		socketThrottle?: number;

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
		 * Amount of time in hours before a user is allowed to respawn, counted from the time of their
		 * initial spawn placement.
		 * @default 0
		 */
		respawnTimeout?: number;

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
		 * Set true to run all services in a single nodejs isolate. This does *not* affect the runner's
		 * isolates.
		 * @default false
		 */
		singleThreaded?: boolean;
	};

	/**
	 * Processor settings
	 */
	processor?: {
		/**
		 * Total number of processor tasks to run at a time. The default is the number of CPU cores
		 * (including hyper-threaded) + 1
		 */
		concurrency?: number;

		/**
		 * Timeout in milliseconds before the processors give up on waiting for intents from the Runner
		 * service and continue processing all outstanding rooms.
		 * @default 5000
		 */
		intentAbandonTimeout?: number;
	};

	/**
	 * Runner settings
	 */
	runner?: {
		cpu?: {
			/**
			 * CPU bucket size per user
			 * @default: 10000
			 */
			bucket?: number;

			/**
			 * Memory limit, in megabytes. The actual memory limit as reported by the isolate will be
			 * higher, since it accounts for shared terrain data.
			 *
			 * This option does nothing when `unsafeSandbox` is true.
			 * @default 256
			 */
			memoryLimit?: number;

			/**
			 * Maximum amount of time in milliseconds that a user's runtime may run for.
			 * @default: 500
			 */
			tickLimit?: number;
		};

		/**
		 * Total number of run tasks to run at a time. The default is the number of CPU cores (including
		 * hyper-threaded) + 1
		 */
		concurrency?: number;

		/**
		 * How long an idle runner will wait before migrating a player sandbox into that runner, causing
		 * a hard reset for the player.
		 * @default 50
		 */
		migrationTimeout?: number;

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

		/**
		 * How often (in wall time minutes) to save the main database
		 * @default 120
		 */
		saveInterval?: number;
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

/**
 * These defaults will be merged into `xxscreepts/config` at runtime
 */
export const defaults = {
	backend: {
		allowGuestAccess: true as boolean,
		bind: '*',
		socketThrottle: 125,
	},
	game: {
		respawnTimeout: 0,
	},
	processor: {
		concurrency: os.cpus().length + 1,
		intentAbandonTimeout: 5000,
	},
	runner: {
		concurrency: os.cpus().length + 1,
		cpu: {
			bucket: 10000,
			memoryLimit: 256,
			tickLimit: 500,
		},
		migrationTimeout: 50,
	},
	schemaArchive: './screeps/archive',
	database: {
		blob: './screeps/db',
		data: './screeps/db/data.json',
		pubsub: 'local://db',
		saveInterval: 2,
	},
	shards: [ {
		name: 'shard0',
		blob: './screeps/shard0',
		data: './screeps/shard0/data.json',
		pubsub: 'local://shard0',
		scratch: 'local://shard0',
	} ],
};

/**
 * These defaults will be written to `.screepsrc.yaml` on import, as a guide for the user. They will
 * also be merged into the `config` defaults.
 */
export const configDefaults = {
	mods: [
		'xxscreeps/mods/classic',
		'xxscreeps/mods/backend/password',
		'xxscreeps/mods/backend/steam',
	],
	backend: {
		secret: crypto.randomBytes(16).toString('hex'),
	},
	game: {
		tickSpeed: 250,
	},
};
