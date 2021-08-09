import type { URL } from 'url';
import type * as P from 'xxscreeps/engine/db/storage/provider';
import * as Fn from 'xxscreeps/utility/functional';
import { RedisHolder } from './client';
type Value = P.Value;

export class RedisProvider implements P.BlobProvider, P.KeyValProvider {
	private constructor(private readonly redis: RedisHolder) {}

	static async connect(url: URL, blob = false) {
		const [ effect, redis ] = await RedisHolder.connect(url, blob);
		const provider = new RedisProvider(redis);
		return [ effect, provider ] as const;
	}

	//
	// keys / strings
	async copy(from: string, to: string, options?: P.Copy) {
		return await this.redis.invoke<number>(cb => this.redis.batch().copy(from, to, ...options?.if === 'nx' ? [] : [ 'replace' ], cb)) !== 0;
	}

	async del(key: string) {
		return await this.redis.invoke<number>(cb => this.redis.batch().del(key, cb)) !== 0;
	}

	get(key: string) {
		return this.redis.invoke<string | null>(cb => this.redis.batch().get(key, cb));
	}

	async getBuffer(key: string) {
		const buffer = await this.get(key) as Uint8Array | null;
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

	async set(key: string, value: Value | Readonly<Uint8Array>, options?: P.Set | P.SetBuffer): Promise<any>;
	async set(key: string, value: Value | Readonly<Uint8Array>, options?: P.Set) {
		const payload: any = function() {
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
			return this.redis.invoke<string | null>(cb => this.redis.batch().set(key, payload, ...extra, 'get', cb));
		} else {
			const result = await this.redis.invoke<'OK' | null>(cb => this.redis.batch().set(key, payload, ...extra, cb));
			// Avoid sending back 'OK'
			return result === null ? null : undefined;
		}
	}

	//
	// numbers
	decr(key: string) {
		return this.redis.invoke<number>(cb => this.redis.batch().decr(key, cb));
	}

	decrBy(key: string, value: number) {
		return this.redis.invoke<number>(cb => this.redis.batch().decrby(key, value, cb));
	}

	incr(key: string) {
		return this.redis.invoke<number>(cb => this.redis.batch().incr(key, cb));
	}

	incrBy(key: string, value: number) {
		return this.redis.invoke<number>(cb => this.redis.batch().incrby(key, value, cb));
	}

	//
	// hashes
	hget(key: string, field: string) {
		return this.redis.invoke<string | null>(cb => this.redis.batch().hget(key, field, cb));
	}

	hgetall(key: string) {
		return this.redis.invoke<Record<string, string>>(cb => this.redis.batch().hgetall(key, cb));
	}

	hincrBy(key: string, field: string, value: number) {
		return this.redis.invoke<number>(cb => this.redis.batch().hincrby(key, field, value, cb));
	}

	async hmget(key: string, fields: string[]) {
		const payload = await this.redis.invoke<string[]>(cb => this.redis.batch().hmget(key, fields, cb));
		return Fn.fromEntries(payload.map((value, ii) => [ fields[ii], value ]));
	}

	async hset(key: string, field: string, value: Value, options?: P.HSet) {
		if (options?.if === 'nx') {
			return await this.redis.invoke<number>(cb => this.redis.batch().hsetnx(key, field, value as string, cb)) !== 0;
		} else {
			return await this.redis.invoke<number>(cb => this.redis.batch().hset(key, field, value as string, cb)) !== 0;
		}
	}

	async hmset(key: string, fields: Iterable<[string, Value]> | Record<string, Value>) {
		const iterable = Symbol.iterator in fields ?
			fields as Iterable<[ string, string ]> :
			Object.entries(fields);
		await this.redis.invoke<number>(cb => this.redis.batch().hset(key, [ ...Fn.concat(iterable) ], cb));
	}

	//
	// lists
	lpop(key: string) {
		return this.redis.invoke<string>(cb => this.redis.batch().lpop(key, cb));
	}

	lrange(key: string, start: number, stop: number) {
		return this.redis.invoke<string[]>(cb => this.redis.batch().lrange(key, start, stop, cb));
	}

	rpush(key: string, elements: string[]) {
		return this.redis.invoke<number>(cb => this.redis.batch().rpush(key, elements, cb));
	}

	//
	// sets
	async sadd(key: string, members: string[]) {
		if (members.length === 0) {
			return Promise.resolve(0);
		} else {
			return this.redis.invoke<number>(cb => this.redis.batch().sadd(key, members, cb));
		}
	}

	scard(key: string) {
		return this.redis.invoke<number>(cb => this.redis.batch().scard(key, cb));
	}

	sdiff(key: string, keys: string[]) {
		return this.redis.invoke<string[]>(cb => this.redis.batch().sdiff(key, keys, cb));
	}

	sinter(key: string, keys: string[]) {
		return this.redis.invoke<string[]>(cb => this.redis.batch().sinter(key, keys, cb));
	}

	async sismember(key: string, member: string) {
		return await this.redis.invoke<number>(cb => this.redis.batch().sismember(key, member, cb)) !== 0;
	}

	smembers(key: string) {
		return this.redis.invoke<string[]>(cb => this.redis.batch().smembers(key, cb));
	}

	async smismember(key: string, members: string[]) {
		const result = await this.redis.invoke<number[]>(cb => this.redis.batch().smismember(key, members, cb));
		return result.map(value => value !== 0);
	}

	spop(key: string) {
		return this.redis.invoke<string>(cb => this.redis.batch().spop(key, cb));
	}

	srem(key: string, members: string[]) {
		if (members.length === 0) {
			return Promise.resolve(0);
		} else {
			return this.redis.invoke<number>(cb => this.redis.batch().srem(key, members, cb));
		}
	}

	sunionStore(key: string, keys: string[]) {
		return this.redis.invoke<number>(cb => this.redis.batch().sunionstore(key, keys, cb));
	}

	//
	// sorted sets
	zadd(key: string, members: [ number, string ][], options?: P.ZAdd) {
		if (members.length === 0) {
			return Promise.resolve(0);
		} else {
			return this.redis.invoke<number>(cb => this.redis.batch().zadd(
				key,
				...options?.if ? [ options.if ] : [],
				...Fn.concat(members),
				cb));
		}
	}

	zcard(key: string) {
		return this.redis.invoke<number>(cb => this.redis.batch().zcard(key, cb));
	}

	async zincrBy(key: string, delta: number, member: string) {
		return Number(await this.redis.invoke<string>(cb => this.redis.batch().zincrby(key, delta, member, cb)));
	}

	zinterStore(key: string, keys: string[], options?: P.ZAggregate) {
		if (options?.weights) {
			return this.redis.invoke<number>(cb => this.redis.batch().zinterstore(key, keys.length, ...keys, 'weights', ...options.weights!, cb));
		} else {
			return this.redis.invoke<number>(cb => this.redis.batch().zinterstore(key, keys.length, ...keys, cb));
		}
	}

	async zmscore(key: string, members: string[]) {
		type T = (number | null)[]; // Raises an eslint condition which deletes the parenthesis below..
		const scores = await this.redis.invoke<T>(cb => this.redis.batch().zmscore(key, members, cb));
		return scores.map(score => score === null ? null : Number(score));
	}

	zrange(key: string, min: any, max: any, options?: P.ZRange) {
		const by: any = options?.by === 'lex' ? [ 'BYLEX' ] :
			options?.by === 'score' ? [ 'BYSCORE' ] : [];
		return this.redis.invoke<string[]>(cb => this.redis.batch().zrange(key, min, max, ...by, cb));
	}

	zrangeWithScores(key: string, min: number, max: number, options?: P.ZRange): any {
		const by: any = options?.by === 'lex' ? [ 'BYLEX' ] :
			options?.by === 'score' ? [ 'BYSCORE' ] : [];
		return this.redis.invoke<number>(cb => this.redis.batch().zrange(key, min, max, ...by, 'WITHSCORES', cb));
	}

	zrem(key: string, members: string[]) {
		return this.redis.invoke<number>(cb => this.redis.batch().zrem(key, members, cb));
	}

	zremRange(key: string, min: number, max: number) {
		return this.redis.invoke<number>(cb => this.redis.batch().zremrangebyscore(key, min, max, cb));
	}

	async zscore(key: string, member: string) {
		const score = await this.redis.invoke<string | null>(cb => this.redis.batch().zscore(key, member, cb));
		return score === null ? null : Number(score);
	}

	zunionStore(key: string, keys: string[]): Promise<number> {
		return this.redis.invoke<number>(cb => this.redis.batch().zunionstore(key, keys.length, ...keys, cb));
	}

	//
	// scripting
	async eval(script: P.KeyvalScript, keys: string[], argv: Value[]): Promise<any> {
		const { sha } = script;
		this.redis.flushBatch();
		if (sha) {
			try {
				return await this.redis.invoke<any>(cb => this.redis.client.evalsha(sha, keys.length, ...keys, ...argv, cb));
			} catch (err) {
				if (err.code !== 'NOSCRIPT') {
					throw err;
				}
			}
		}
		const loaded = await this.redis.invoke<string>(cb => this.redis.client.script('LOAD', script.lua, cb));
		// @ts-expect-error
		script.sha = loaded;
		return this.eval(script, keys, argv);
	}

	//
	// management
	async flushdb() {
		this.redis.flushBatch();
		await this.redis.invoke(cb => this.redis.client.flushdb(cb));
	}

	async save() {
		this.redis.flushBatch();
		try {
			// ERR Background save already in progress
			await this.redis.invoke(cb => this.redis.client.save(cb));
		} catch (err) {}
	}
}
