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
	 * Note: xxscreeps itself does not send a confirmation mail; install a mod which does and set
	 * `autoVerifyEmail: false` to require one.
	 * @default false
	 */
	allowEmailRegistration?: boolean;

	/**
	 * Prefix put in front of urls the backend mints for assets it serves, which are otherwise rooted
	 * at `/`. Needed when the backend does not sit at the root of the origin the client is served
	 * from: an origin of its own, e.g. "https://screeps.example.com", or the path a proxy mounts it
	 * under, e.g. "/(http://localhost:21025)" for the steamless client. Prepended verbatim, so it
	 * takes either.
	 */
	assetBaseUrl?: string;

	/**
	 * Whether email addresses are trusted immediately on registration/change, rather than held
	 * pending until the user opens a confirmation link. Turning this off needs `publicUrl` set and a
	 * mod which delivers mail; without either, addresses are held pending with no way to confirm
	 * them. Note that an address held pending is not yet a sign-in identity — until it is confirmed
	 * the user signs in by username.
	 * @default true
	 */
	autoVerifyEmail?: boolean;

	/**
	 * Network interface to bind server to. Format is: "host" or "host:port". Host can be * to bind
	 * to all interfaces: "*:port". Port is 21025, if not specified.
	 * @default *
	 */
	bind?: string;

	/**
	 * Where the backend sends a user's browser after they open an address confirmation link. The
	 * outcome is appended as `emailVerified=1` or `emailVerified=0`, so the destination can report
	 * it. Defaults to the server root, which is the client on a stock install; point it elsewhere
	 * when the client is served from another origin.
	 * @default /
	 */
	emailVerifyRedirect?: string;

	/**
	 * How long an address confirmation link stays valid, in hours.
	 * @default 24
	 */
	emailVerifyTtlHours?: number;

	/**
	 * Reverse proxy configuration. TODO: mTLS, otherwise publicly-accessible backends on the public
	 * internet can receive forged requests. This isn't a big deal for us at the moment since we don't
	 * do anything with the client ip.
	 */
	proxy?: BackendProxyConfig;

	/**
	 * Where this server is reachable from a browser, e.g. "https://screeps.example.com". Links the
	 * backend mails out are rooted here. It cannot be taken from the request which triggers the mail:
	 * that origin is the `Host` header, so a forged one would have us mail a link pointing somewhere
	 * else entirely.
	 */
	publicUrl?: string;

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
	 * available to this process (including hyper-threaded, respecting CPU affinity) + 1
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
	 * Total number of run tasks to run at a time. The default is the number of CPU cores available to
	 * this process (including hyper-threaded, respecting CPU affinity) + 1
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
		concurrency: os.availableParallelism() + 1,
		intentAbandonTimeout: 5000,
	},
	runner: {
		concurrency: os.availableParallelism() + 1,
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
