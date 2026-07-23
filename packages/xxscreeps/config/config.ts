import * as crypto from 'node:crypto';
import * as os from 'node:os';
import schema from './config.schema.json' with { type: 'json' };

export { schema };

export interface BackendConfig {
	/**
	 * Whether to allow read-only access to the API without logging in.
	 * @default true
	 */
	allowGuestAccess?: boolean;

	/**
	 * Whether to allow users sign up without steam with only their email address.
	 * Note: there is currently no confirmation mail send to the user to verify the address.
	 * @default false
	 */
	allowEmailRegistration?: boolean;

	/**
	 * Network interface to bind server to. Format is: "host" or "host:port". Host can be * to bind
	 * to all interfaces: "*:port". Port is 21025, if not specified.
	 * @default *
	 */
	bind?: string;

	/**
	 * Reverse proxy configuration. TODO: mTLS, otherwise publicly-accessible backends on the public
	 * internet can receive forged requests. This isn't a big deal for us at the moment since we don't
	 * do anything with the client ip.
	 */
	proxy?: BackendProxyConfig;

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
}

interface BackendProxyConfig {
	/**
	 * Expected number of reverse proxy servers in front of the backend.
	 */
	forwardedCount: number;
}

export interface DatabaseConfig {
	/**
	 * Persistent storage provider URI
	 * @default ./screeps/db?socket=.db
	 */
	data: string;

	/**
	 * Path used for local process lock. Note that the 'file:' database providers also each acquire
	 * their own lock on the data store. This is mainly used to coordinate inter-process
	 * communication. You can set this to `null` while using the redis provider.
	 * @default ./screeps/.lock
	 */
	lock?: string | null;

	/**
	 * Pubsub storage provider URI
	 * @default local://db?socket=./screeps/.db.pubsub
	 */
	pubsub: string;

	/**
	 * How often (in wall time minutes) to save the main database
	 * @default 120
	 */
	saveInterval?: number;
}

export interface ShardConfig {
	/**
	 * Name of this shard
	 */
	name: string;

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
}

export interface GameConfig {
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
}

export interface LauncherConfig {
	/**
	 * Set true to run all services in a single nodejs isolate. This does *not* affect the runner's
	 * isolates.
	 * @default false
	 */
	singleThreaded?: boolean;
}

export interface ProcessorConfig {
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

	/**
	 * Show processor log messages when running from main thread.
	 * @default false
	 */
	log?: boolean;
}

export interface RunnerConfig {
	/**
	 * Per-user CPU settings
	 */
	cpu?: RunnerCPUConfig;

	/**
	 * Total number of run tasks to run at a time. The default is the number of CPU cores (including
	 * hyper-threaded) + 1
	 */
	concurrency?: number;

	/**
	 * Show runner log messages when running from main thread.
	 * @default false
	 */
	log?: boolean;

	/**
	 * How long an idle runner will wait before migrating a player sandbox into that runner, causing
	 * a hard reset for the player.
	 * @default 50
	 */
	migrationTimeout?: number;

	/**
	 * Select sandbox mode
	 * - 'experimental': `@isolated-vm/experimental`
	 * - 'isolated': `isolated-vm`
	 * - 'unsafe': `node:vm`. This will run player code directly in the nodejs isolate. Player scripts can achieve full
	 *   system-level access. It may make troubleshooting user scripts easier, though.
	 * @default isolated
	 */
	sandbox?: 'experimental' | 'isolated' | 'unsafe' | undefined;
}

export interface RunnerCPUConfig {
	/**
	 * CPU bucket size per user
	 * @default 10000
	 */
	bucket?: number;

	/**
	 * Memory limit, in megabytes. The actual memory limit as reported by the isolate will be
	 * higher, since it accounts for shared terrain data.
	 *
	 * This option does nothing when `sandbox: unsafe` is set.
	 * @default 256
	 */
	memoryLimit?: number;

	/**
	 * Maximum amount of time in milliseconds that a user's runtime may run for.
	 * @default 500
	 */
	tickLimit?: number;
}

export interface Config {
	/**
	 * Backend server settings
	 */
	backend?: BackendConfig;

	/**
	 * Game settings
	 */
	game?: GameConfig;

	/**
	 * Launcher settings
	 */
	launcher?: LauncherConfig;

	/**
	 * List of mods to load
	 */
	mods?: string[];

	/**
	 * Processor settings
	 */
	processor?: ProcessorConfig;

	/**
	 * Runner settings
	 */
	runner?: RunnerConfig;

	/**
	 * Optional location to save archived binary format and Kaitai descriptors for inspection or
	 * troubleshooting.
	 */
	schemaArchive?: string | undefined;

	/**
	 * Configuration for global database storage
	 */
	database?: DatabaseConfig;

	/**
	 * Configuration for shard-specific storage
	 * @default `[ {
	 *   name: 'shard0',
	 *   data: './screeps/shard0?socket=.shard0.db',
	 *   pubsub: 'local://shard0?socket=./screeps/.shard0.pubsub',
	 *   scratch: 'local://shard0?socket=./screeps/.shard0.scratch',
	 * } ]`
	 */
	shards?: readonly ShardConfig[];
}

/**
 * These defaults will be merged into `xxscreepts/config` at runtime
 */
export const defaults = {
	backend: {
		allowGuestAccess: Boolean(true),
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
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
		sandbox: 'isolated' as RunnerConfig['sandbox'],
	},
	database: {
		data: './screeps/db?socket=.db',
		lock: './screeps/.lock',
		pubsub: 'local://db?socket=./screeps/.db.pubsub',
		saveInterval: 2,
	},
	shards: [ {
		name: 'shard0',
		data: './screeps/shard0?socket=.shard0.db',
		pubsub: 'local://shard0?socket=./screeps/.shard0.pubsub',
		scratch: 'local://shard0?socket=./screeps/.shard0.scratch',
	} ],
} satisfies Config;

/**
 * These defaults will be written to `.screepsrc.yaml` on import, as a guide for the user. They will
 * also be merged into the `config` defaults.
 */
export const initializationDefaults = {
	mods: [
		'xxscreeps/mods/classic',
		'xxscreeps/mods/backend/cookie',
		'xxscreeps/mods/backend/password',
		'xxscreeps/mods/backend/steam',
	],
	backend: {
		secret: crypto.randomBytes(16).toString('hex'),
	},
	game: {
		tickSpeed: 250,
	},
} satisfies Config;
