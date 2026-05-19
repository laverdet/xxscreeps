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
	return client;
}
