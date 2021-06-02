import type { Redis } from './redis';
import type { URL } from 'url';
import type * as P from 'xxscreeps/engine/db/storage/provider';
import * as Fn from 'xxscreeps/utility/functional';
import { makeClient } from './redis';
type Value = P.Value;

export class RedisProvider implements P.BlobProvider, P.KeyValProvider {
	constructor(private readonly client: Redis) {
		client.defineCommand('cad', {
			numberOfKeys: 1,
			lua:
`if redis.call('get', KEYS[1]) == ARGV[1] then
	return redis.call('del', KEYS[1])
else
	return 0
end`,
		});
	}

	static async connect(url: URL, blob = false) {
		return new RedisProvider(await makeClient(url, blob));
	}

	disconnect() {
		this.client.disconnect();
	}

	//
	// keys / strings
	async cad(key: string, check: string) {
		return await (this.client as any).cad(key, check) !== 0;
	}

	async copy(from: string, to: string, options?: P.Copy) {
		return await this.client.copy(from, to, ...options?.if === 'nx' ? [] : [ 'replace' as const ]) !== 0;
	}

	async del(key: string) {
		return await this.client.del(key) !== 0;
	}

	get(key: string) {
		return this.client.get(key);
	}

	async getBuffer(key: string) {
		const buffer = await this.client.getBuffer(key);
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (buffer === null) {
			return null;
		}
		const copy = new Uint8Array(new SharedArrayBuffer(buffer.byteLength));
		copy.set(buffer);
		return copy;
	}

	async reqBuffer(key: string) {
		const value = await this.getBuffer(key);
		if (value === null) {
			throw new Error(`"${key}" does not exist`);
		}
		return value;
	}

	async set(key: string, value: Value | Readonly<Uint8Array>, options?: P.Set): Promise<any> {
		const payload = function() {
			if (typeof value === 'string' || typeof value === 'number' || value instanceof Buffer) {
				return value;
			} else {
				return Buffer.from(value);
			}
		}();
		const extra: any[] = [
			...options?.px ? [ 'px', options.px ] : [],
			...options?.if ? [ options.if ] : [],
		];
		if (options?.get) {
			return this.client.set(key, payload, ...extra, 'get');
		} else {
			const result = await this.client.set(key, payload, ...extra);
			// Avoid sending back 'OK'
			return result === null ? null : undefined;
		}
	}

	//
	// numbers
	decr(key: string) {
		return this.client.decr(key);
	}

	decrBy(key: string, value: number) {
		return this.client.decrby(key, value);
	}

	incr(key: string) {
		return this.client.incr(key);
	}

	incrBy(key: string, value: number) {
		return this.client.incrby(key, value);
	}

	//
	// hashes
	hget(key: string, field: string) {
		return this.client.hget(key, field);
	}

	hgetall(key: string) {
		return this.client.hgetall(key);
	}

	async hmget(key: string, fields: string[]) {
		const payload = await this.client.hmget(key, fields);
		return Fn.fromEntries(payload.map((value, ii) => [ fields[ii], value ]));
	}

	async hset(key: string, field: string, value: Value, options?: P.HSet) {
		if (options?.if === 'nx') {
			return await this.client.hsetnx(key, field, value) !== 0;
		} else {
			return await this.client.hset(key, field, value) !== 0;
		}
	}

	async hmset(key: string, fields: Iterable<[string, Value]> | Record<string, Value>) {
		const iterable = Symbol.iterator in fields ?
			fields as Iterable<[ string, Value ]> :
			Object.entries(fields);
		await this.client.hset(key, ...Fn.concat(iterable));
	}

	//
	// lists
	lpop(key: string) {
		return this.client.lpop(key);
	}

	lrange(key: string, start: number, stop: number) {
		return this.client.lrange(key, start, stop);
	}

	rpush(key: string, elements: string[]) {
		return this.client.rpush(key, elements);
	}

	//
	// sets
	async sadd(key: string, members: string[]) {
		if (members.length === 0) {
			return Promise.resolve(0);
		} else {
			return this.client.sadd(key, members);
		}
	}

	scard(key: string) {
		return this.client.scard(key);
	}

	async sismember(key: string, member: string) {
		return await this.client.sismember(key, member) !== 0;
	}

	smembers(key: string) {
		return this.client.smembers(key);
	}

	spop(key: string) {
		return this.client.spop(key);
	}

	srem(key: string, members: string[]) {
		return this.client.srem(key, members);
	}

	//
	// sorted sets
	zadd(key: string, members: [ number, string ][], options?: P.ZAdd) {
		if (members.length === 0) {
			return Promise.resolve(0);
		} else {
			return this.client.zadd(
				key,
				...options?.if ? [ options.if ] : [],
				...Fn.concat<number | string>(members)) as Promise<number>;
		}
	}

	zcard(key: string) {
		return this.client.zcard(key);
	}

	async zincrBy(key: string, delta: number, member: string) {
		return Number(await this.client.zincrby(key, delta, member));
	}

	zmscore(key: string, members: string[]) {
		return this.client.zmscore(key, members);
	}

	zrange(key: string, min: any, max: any, options?: P.ZRange) {
		const by: any = options?.by === 'lex' ? [ 'BYLEX' ] :
			options?.by === 'score' ? [ 'BYSCORE' ] : [];
		return this.client.zrange(key, min, max, ...by);
	}

	zrangeWithScores(key: string, min: number, max: number, options?: P.ZRange): any {
		const by: any = options?.by === 'lex' ? [ 'BYLEX' ] :
			options?.by === 'score' ? [ 'BYSCORE' ] : [];
		return this.client.zrange(key, min, max, ...by, 'WITHSCORES');
	}

	zrem(key: string, members: string[]) {
		return this.client.zrem(key, members);
	}

	zremRange(key: string, min: number, max: number) {
		return this.client.zremrangebyscore(key, min, max);
	}

	zunionStore(key: string, keys: string[]): Promise<number> {
		return this.client.zunionstore(key, keys.length, keys as never) as any;
	}

	//
	// management
	async flushdb() {
		await this.client.flushdb();
	}

	async save() {
		await this.client.save();
	}
}
