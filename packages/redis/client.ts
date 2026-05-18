import * as redis from 'redis';

interface AsBlob extends redis.TypeMapping {
	[redis.RESP_TYPES.BLOB_STRING]: BufferConstructor;
}

/** @internal */
export type RedisClient = redis.RedisClientType<redis.RedisModules, redis.RedisFunctions, redis.RedisScripts, redis.RespVersions, redis.TypeMapping>;
/** @internal */
export type RedisBlobClient = redis.RedisClientType<redis.RedisModules, redis.RedisFunctions, redis.RedisScripts, redis.RespVersions, AsBlob>;

/** @internal */
export async function acquireRedisClient(url: URL, blob?: false): Promise<RedisClient>;
/** @internal */
export async function acquireRedisClient(url: URL, blob: true): Promise<RedisBlobClient>;
export async function acquireRedisClient(url: URL, blob = false): Promise<RedisClient | RedisBlobClient> {
	const client = function() {
		const client = redis.createClient({
			url: url.href,
			disableOfflineQueue: true,
			RESP: 3,
		});
		if (blob) {
			return client.withTypeMapping({
				[redis.RESP_TYPES.BLOB_STRING]: Buffer,
			});
		} else {
			return client;
		}
	}();
	await client.connect();
	await assertMinimumVersion(client);
	return client;
}

async function assertMinimumVersion(client: RedisClient | RedisBlobClient) {
	const match = /^redis_version:(\d+)\.(\d+)/m.exec(String(await client.info('server')));
	if (!match) throw new Error('@xxscreeps/redis: could not read redis_version from INFO server');
	const [ , major, minor ] = match;
	if (Number(major) < 8 || (Number(major) === 8 && Number(minor) < 2)) {
		throw new Error(`@xxscreeps/redis requires Redis >= 8.2 (found ${major}.${minor})`);
	}
}
