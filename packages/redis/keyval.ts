import type * as P from 'xxscreeps/engine/db/storage/provider.js';
import { Buffer } from 'node:buffer';
import { Fn } from 'xxscreeps/functional/fn.js';
import { RedisHolder } from './client.js';

type Value = P.Value;
function recv(value: Value) {
	// Convert value to type for redis
	if (value instanceof Uint8Array) {
		if (Buffer.isBuffer(value)) {
			// node-redis accepts buffers, but the types usually specify only string
			return value as never as string;
		} else {
			// this does not make a copy
			return Buffer.from(value.buffer, value.byteOffset, value.byteLength) as never as string;
		}
	} else {
		return `${value as number | string}`;
	}
}

function send<Type>(value: Type, options?: P.AsBlob): Type | string {
	// Convert value from redis
	if (Buffer.isBuffer(value)) {
		if (options?.blob) {
			const copy = new Uint8Array(new SharedArrayBuffer(value.byteLength));
			copy.set(value);
			return copy as never;
		} else {
			return value.toString('utf8');
		}
	}
	return value;
}

function sendv(values: string[], options?: P.AsBlob) {
	return values.map(value => send(value, options));
}

export class RedisProvider implements P.KeyValProvider {
	private readonly redis;

	private constructor(redis: RedisHolder) {
		this.redis = redis;
	}

	static async connect(url: URL) {
		const [ effect, redis ] = await RedisHolder.connect(url, true);
		const provider = new RedisProvider(redis);
		return [ effect, provider ] as const;
	}

	//
	// keys / strings
	async copy(from: string, to: string, options?: P.Copy) {
		return await this.redis.invoke<number>(cb => this.redis.batch(from, to)
			.copy(from, to, ...options?.if === 'nx' ? [] : [ 'replace' ], cb)) !== 0;
	}

	async del(key: string) {
		return await this.redis.invoke<number>(cb => this.redis.batch(key).del(key, cb)) !== 0;
	}

	vdel(key: string) {
		return this.redis.merge('del', [ key ], key, async argv => {
			await this.redis.invoke<number>(cb => this.redis.batch().del(argv, cb));
		});
	}

	async get(key: string, options?: P.AsBlob): Promise<any> {
		return send(await this.redis.invoke<string | null>(cb => this.redis.batch(key).get(key, cb)), options);
	}

	async req(key: string, options?: P.AsBlob): Promise<any> {
		const value = await this.get(key, options);
		if (value === null) {
			throw new Error(`"${key}" does not exist`);
		}
		return send(value, options);
	}

	async set(key: string, value: Value, options?: P.Set): Promise<any>;
	async set(key: string, value: Value, options?: P.Set) {
		const extra: any[] = [
			...options?.px ? [ 'px', options.px ] : [],
			...options?.if ? [ options.if ] : [],
		];
		if (options?.get) {
			return send(await this.redis.invoke<string | null>(cb => this.redis.batch(key).set(key, recv(value), ...extra, 'get', cb)));
		} else {
			const result = await this.redis.invoke<'OK' | null>(cb => this.redis.batch(key).set(key, recv(value), ...extra, cb));
			// Avoid sending back 'OK'
			return result === null ? null : undefined;
		}
	}

	//
	// numbers
	decr(key: string) {
		return this.redis.invoke<number>(cb => this.redis.batch(key).decr(key, cb));
	}

	decrBy(key: string, value: number) {
		return this.redis.invoke<number>(cb => this.redis.batch(key).decrby(key, value, cb));
	}

	incr(key: string) {
		return this.redis.invoke<number>(cb => this.redis.batch(key).incr(key, cb));
	}

	incrBy(key: string, value: number) {
		return this.redis.invoke<number>(cb => this.redis.batch(key).incrby(key, value, cb));
	}

	//
	// hashes
	async hdel(key: string, fields: string[]) {
		return this.redis.invoke<number>(cb => this.redis.batch(key).hdel(key, fields, cb));
	}

	async hget(key: string, field: string) {
		return send(await this.redis.invoke<string | null>(cb => this.redis.batch(key).hget(key, field, cb)));
	}

	async hgetall(key: string) {
		const result = await this.redis.invoke<Record<string, string> | null>(cb => this.redis.batch(key).hgetall(key, cb));
		return Fn.fromEntries(Object.entries(result ?? {}), ([ key, val ]) => [ key, send(val) ]);
	}

	hincrBy(key: string, field: string, value: number) {
		return this.redis.invoke<number>(cb => this.redis.batch(key).hincrby(key, field, value, cb));
	}

	async hmget(key: string, fields: string[], options?: P.AsBlob) {
		const payload = await this.redis.invoke<string[]>(cb => this.redis.batch(key).hmget(key, fields, cb));
		return Fn.fromEntries(payload.map((value, ii) => [ fields[ii], send(value, options) ])) as never;
	}

	async hset(key: string, field: string, value: Value, options?: P.HSet) {
		if (options?.if === 'nx') {
			return await this.redis.invoke<number>(cb => this.redis.batch(key).hsetnx(key, field, recv(value), cb)) !== 0;
		} else {
			return await this.redis.invoke<number>(cb => this.redis.batch(key).hset(key, field, recv(value), cb)) !== 0;
		}
	}

	async hmset(key: string, fields: Iterable<[ string, Value ]> | Record<string, Value>) {
		const iterable = Symbol.iterator in fields
			? fields as Iterable<[ string, Value ]> :
			Object.entries(fields);
		await this.redis.invoke<number>(cb => this.redis.batch(key).hset(key, [ ...Fn.map(Fn.concat(iterable), recv) ], cb));
	}

	//
	// lists
	async lpop(key: string) {
		return send(await this.redis.invoke<string>(cb => this.redis.batch(key).lpop(key, cb)));
	}

	async lrange(key: string, start: number, stop: number) {
		return sendv(await this.redis.invoke<string[]>(cb => this.redis.batch(key).lrange(key, start, stop, cb)));
	}

	rpush(key: string, elements: Value[]) {
		return this.redis.invoke<number>(cb => this.redis.batch(key).rpush(key, elements.map(recv), cb));
	}

	//
	// sets
	async sadd(key: string, members: string[]) {
		if (members.length === 0) {
			return Promise.resolve(0);
		} else {
			return this.redis.invoke<number>(cb => this.redis.batch(key).sadd(key, members, cb));
		}
	}

	scard(key: string) {
		return this.redis.invoke<number>(cb => this.redis.batch(key).scard(key, cb));
	}

	async sdiff(key: string, keys: string[]) {
		return sendv(await this.redis.invoke<string[]>(cb => this.redis.batch(key).sdiff(key, keys, cb)));
	}

	async sinter(key: string, keys: string[]) {
		return sendv(await this.redis.invoke<string[]>(cb => this.redis.batch(key, ...keys).sinter(key, keys, cb)));
	}

	async sismember(key: string, member: string) {
		return await this.redis.invoke<number>(cb => this.redis.batch(key).sismember(key, member, cb)) !== 0;
	}

	async smembers(key: string) {
		return sendv(await this.redis.invoke<string[]>(cb => this.redis.batch(key).smembers(key, cb)));
	}

	async smismember(key: string, members: string[]) {
		const result = await this.redis.invoke<number[]>(cb => this.redis.batch(key).smismember(key, members, cb));
		return result.map(value => value !== 0);
	}

	async spop(key: string) {
		return send(await this.redis.invoke<string>(cb => this.redis.batch(key).spop(key, cb)));
	}

	srem(key: string, members: string[]) {
		if (members.length === 0) {
			return Promise.resolve(0);
		} else {
			return this.redis.invoke<number>(cb => this.redis.batch(key).srem(key, members, cb));
		}
	}

	sunionStore(key: string, keys: string[]) {
		return this.redis.invoke<number>(cb => this.redis.batch(key).sunionstore(key, keys, cb));
	}

	//
	// sorted sets
	async zadd(key: string, members: [ number, string ][], options?: P.ZAdd) {
		if (members.length === 0) {
			return Promise.resolve(0);
		} else {
			const result = await this.redis.invoke<number>(cb => this.redis.batch(key).zadd(
				key,
				...options?.if ? [ options.if ] : [],
				...options?.incr ? [ 'incr' ] : [],
				...Fn.concat<number | string>(members),
				cb));
			return options?.incr ? Number(send(result)) : result;
		}
	}

	zcard(key: string) {
		return this.redis.invoke<number>(cb => this.redis.batch(key).zcard(key, cb));
	}

	async zincrBy(key: string, delta: number, member: string) {
		return Number(await this.redis.invoke<string>(cb => this.redis.batch(key).zincrby(key, delta, member, cb)));
	}

	zinterStore(key: string, keys: string[], options?: P.ZAggregate) {
		if (options?.weights) {
			return this.redis.invoke<number>(cb => this.redis.batch(key, ...keys).zinterstore(key, keys.length, ...keys, 'weights', ...options.weights!, cb));
		} else {
			return this.redis.invoke<number>(cb => this.redis.batch(key, ...keys).zinterstore(key, keys.length, ...keys, cb));
		}
	}

	async zmscore(key: string, members: string[]) {
		type T = (number | null)[]; // Raises an eslint condition which deletes the parenthesis below..
		const scores = await this.redis.invoke<T>(cb => this.redis.batch(key).zmscore(key, members, cb));
		return scores.map(score => score === null ? null : Number(score));
	}

	async zrange(key: string, min: any, max: any, options?: P.ZRange) {
		const by: any = options?.by === 'lex' ? [ 'BYLEX' ] :
			options?.by === 'score' ? [ 'BYSCORE' ] : [];
		return sendv(await this.redis.invoke<string[]>(cb => this.redis.batch(key).zrange(key, min, max, ...by, cb)));
	}

	async zrangeStore(into: string, from: string, min: any, max: any, options?: P.ZRange) {
		const by: any = options?.by === 'lex' ? [ 'BYLEX' ] :
			options?.by === 'score' ? [ 'BYSCORE' ] : [];
		return this.redis.invoke<number>(cb => this.redis.batch(into, from).zrangestore(into, from, min, max, ...by, cb));
	}

	zrangeWithScores(key: string, min: number, max: number, options?: P.ZRange): any {
		const by: any = options?.by === 'lex' ? [ 'BYLEX' ] :
			options?.by === 'score' ? [ 'BYSCORE' ] : [];
		return this.redis.invoke<number>(cb => this.redis.batch(key).zrange(key, min, max, ...by, 'WITHSCORES', cb));
	}

	zrem(key: string, members: string[]) {
		return this.redis.invoke<number>(cb => this.redis.batch(key).zrem(key, members, cb));
	}

	zremRange(key: string, min: number, max: number) {
		return this.redis.invoke<number>(cb => this.redis.batch(key).zremrangebyscore(key, min, max, cb));
	}

	async zscore(key: string, member: string) {
		const score = send(await this.redis.invoke<string | null>(cb => this.redis.batch(key).zscore(key, member, cb)));
		return score === null ? null : Number(score);
	}

	zunionStore(key: string, keys: string[], options?: P.ZAggregate): Promise<number> {
		if (options?.weights) {
			return this.redis.invoke<number>(cb => this.redis.batch(key, ...keys).zunionstore(key, keys.length, ...keys, 'weights', ...options.weights!, cb));
		} else {
			return this.redis.invoke<number>(cb => this.redis.batch(key, ...keys).zunionstore(key, keys.length, ...keys, cb));
		}
	}

	//
	// scripting
	async eval(script: P.KeyvalScript, keys: string[], argv: Value[]): Promise<any> {
		const { sha } = script;
		if (sha) {
			const result = await this.redis.invoke<any>(cb =>
				this.redis.batch(...keys).evalsha(sha, keys.length, ...keys, ...Fn.map(argv, recv), cb));
			if (Array.isArray(result)) {
				return sendv(result);
			} else {
				return send(result);
			}
		}
		await this.load(script);
		return this.eval(script, keys, argv);
	}

	async load(script: P.KeyvalScript) {
		if (!script.sha) {
			const loaded = await this.redis.invoke<string>(cb => this.redis.client.script('LOAD', script.lua, cb));
			// @ts-expect-error
			script.sha = loaded;
		}
	}

	//
	// management
	async flushdb() {
		await this.redis.sync();
		await this.redis.invoke(cb => this.redis.client.flushdb(cb));
	}

	async save() {
		await this.redis.sync();
		try {
			// ERR Background save already in progress
			await this.redis.invoke(cb => this.redis.client.save(cb));
		} catch {}
	}
}
