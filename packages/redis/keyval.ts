import type { RedisBlobClient, RedisClient } from './client.js';
import type * as Pr from 'xxscreeps/engine/db/storage/provider.js';
import { Buffer } from 'node:buffer';
import { Fn } from 'xxscreeps/functional/fn.js';
import { acquireWith } from 'xxscreeps/utility/async.js';
import { acquireRedisClient } from './client.js';

type Value = Pr.Value;

function recv(value: Value) {
	// Convert value to type for redis
	switch (value.constructor.name) {
		case 'Buffer': return value as Buffer;
		// this does not make a copy (still needed with redis client v5.12.1)
		// @ts-expect-error
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		case 'Uint8Array': return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
		default: return `${value as number | string}`;
	}
}

function send<Type>(value: Type, options?: Pr.AsBlob): Type | string {
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

function sendBlob(value: Buffer | null) {
	if (Buffer.isBuffer(value)) {
		const copy = new Uint8Array(new SharedArrayBuffer(value.byteLength));
		copy.set(value);
		return copy;
	} else {
		return value;
	}
}

function sendOk(value: string | null) {
	if (value === null) {
		return false;
	} else if (value === 'OK') {
		return undefined;
	} else {
		throw new Error(`Unexpected simple reply from Redis: '${value}'`);
	}
}

function zAggregate(keys: string[], aggregate?: Pr.ZAggregate) {
	const weights = aggregate?.weights;
	if (weights) {
		const keysAndWeights = keys.map((key, ii) => ({ key, weight: weights[ii]! } as const));
		type KeysAndWeights = (typeof keysAndWeights)[number];
		return keysAndWeights as [ KeysAndWeights, ...KeysAndWeights[] ];
	} else {
		return keys as [ string, ...string[] ];
	}
}

function zRangeOptions(options?: Pr.ZRange) {
	return options && {
		...options.by !== undefined && { BY: options.by },
		...options.limit !== undefined && {
			LIMIT: { offset: options.limit[0], count: options.limit[1] },
		},
	};
}

export class RedisProvider implements Pr.KeyValProvider {
	private readonly disposable;
	private readonly keyval;
	private readonly blob;
	private readonly withSave;

	private constructor(disposable: AsyncDisposableStack, keyval: RedisClient, blob: RedisBlobClient, withSave: boolean) {
		this.disposable = disposable;
		this.keyval = keyval;
		this.blob = blob;
		this.withSave = withSave;
	}

	static async connect(url: URL) {
		await using disposable = new AsyncDisposableStack();
		const [ keyval, blob ] = await acquireWith(
			client => disposable.adopt(client, client => client.close()),
			acquireRedisClient(url),
			acquireRedisClient(url, true),
		);
		return new RedisProvider(disposable.move(), keyval, blob, url.searchParams.has('save'));
	}

	async [Symbol.asyncDispose]() {
		await this.disposable.disposeAsync();
	}

	//
	// keys / strings
	async copy(from: string, to: string, options?: Pr.Copy) {
		const result = await this.keyval.copy(from, to, options?.if === 'NX' ? undefined : { REPLACE: true });
		return result === 1;
	}

	async del(key: string) {
		return await this.keyval.del(key) !== 0;
	}

	async delEx(key: string, options: Pr.DelEx) {
		return await this.keyval.delEx(key, { condition: 'IFEQ', matchValue: options.eq }) === 1;
	}

	async mdel(...keys: string[]) {
		if (keys.length === 0) {
			return 0;
		} else {
			return this.keyval.del(keys);
		}
	}

	async vdel(key: string) {
		await this.keyval.del(key);
	}

	get(key: string, options: { blob: true }): Promise<Readonly<Uint8Array> | null>;
	get(key: string, options?: Pr.AsBlob): Promise<string | null>;
	async get(key: string, options?: Pr.AsBlob): Promise<Readonly<Uint8Array> | string | null> {
		if (options?.blob) {
			return sendBlob(await this.blob.get(key)) satisfies Uint8Array | null;
		} else {
			return this.keyval.get(key) satisfies Promise<string | null>;
		}
	}

	async pTTL(key: string) {
		return Number(await this.keyval.pTTL(key));
	}

	async req(key: string, options?: Pr.AsBlob): Promise<any> {
		const value: unknown = await this.get(key, options);
		if (value === null) {
			throw new Error(`"${key}" does not exist`);
		}
		return send(value, options);
	}

	set(key: string, value: Value, options: { get: true } & Pr.Set): Promise<string | null>;
	set(key: string, value: Value, options: { if: Pr.Condition; get?: undefined } & Pr.Set): Promise<false | undefined>;
	set(key: string, value: Value, options?: Pr.Set): Promise<undefined>;
	async set(key: string, value: Value, options?: Pr.Set) {
		const result = await this.keyval.set(key, recv(value), options && {
			...options.px !== undefined && { PX: options.px },
			...options.if && function() {
				switch (options.if.if) {
					case 'EQ': return { condition: 'IFEQ', matchValue: recv(options.if.value) };
					case 'NE': return { condition: 'IFNE', matchValue: recv(options.if.value) };
					case 'NX': return { condition: 'NX' };
					case 'XX': return { condition: 'XX' };
				}
			}(),
		});
		if (options?.get) {
			return send(result) satisfies string | null;
		} else if (options?.if !== undefined) {
			return sendOk(result) satisfies false | undefined;
		}
	}

	//
	// numbers
	decr(key: string) {
		return this.keyval.decr(key);
	}

	decrBy(key: string, value: number) {
		return this.keyval.decrBy(key, value);
	}

	incr(key: string) {
		return this.keyval.incr(key);
	}

	incrBy(key: string, value: number) {
		return this.keyval.incrBy(key, value);
	}

	//
	// hashes
	hDel(key: string, fields: string[]) {
		return this.keyval.hDel(key, fields);
	}

	hGet(key: string, field: string) {
		return this.keyval.hGet(key, field);
	}

	hGetAll(key: string) {
		return this.keyval.hGetAll(key);
	}

	hincrBy(key: string, field: string, value: number) {
		return this.keyval.hIncrBy(key, field, value);
	}

	async hmGet(key: string, fields: string[], options?: Pr.AsBlob): Promise<any> {
		const make = <Type, Result>(values: readonly Type[], send: (value: Type) => Result) =>
			Fn.pipe(
				fields,
				$$ => Fn.map($$, (field, ii) => [ field, send(values[ii]!) ] as const),
				$$ => Fn.fromEntries($$));
		if (options?.blob) {
			return make(await this.blob.hmGet(key, fields), sendBlob) satisfies Record<string, Uint8Array | null>;
		} else {
			return make(await this.keyval.hmGet(key, fields), send) satisfies Record<string, string | null>;
		}
	}

	async hSet(key: string, field: string, value: Value, options?: Pr.HSet) {
		if (options?.if === 'NX') {
			return await this.keyval.hSetNX(key, field, recv(value)) !== 0;
		} else {
			return await this.keyval.hSet(key, field, recv(value)) !== 0;
		}
	}

	async hmset(key: string, fields: Iterable<[ string, Value ]> | Record<string, Value>) {
		const iterable = Symbol.iterator in fields ? fields : Object.entries(fields);
		await Fn.mapAwait(iterable, async ([ field, value ]) => this.keyval.hSet(key, field, recv(value)));
	}

	//
	// lists
	lPop(key: string) {
		return this.keyval.lPop(key);
	}

	lRange(key: string, start: number, stop: number) {
		return this.keyval.lRange(key, start, stop);
	}

	rPush(key: string, elements: Value[]) {
		return this.keyval.rPush(key, elements.map(recv));
	}

	//
	// sets
	sAdd(key: string, members: string[]) {
		if (members.length === 0) {
			return Promise.resolve(0);
		} else {
			return this.keyval.sAdd(key, members);
		}
	}

	sCard(key: string) {
		return this.keyval.sCard(key);
	}

	sDiff(key: string, keys: string[]) {
		return this.keyval.sDiff([ key, ...keys ]);
	}

	sInter(key: string, keys: string[]) {
		return this.keyval.sInter([ key, ...keys ]);
	}

	async sIsMember(key: string, member: string) {
		return await this.keyval.sIsMember(key, member) !== 0;
	}

	sMembers(key: string) {
		return this.keyval.sMembers(key);
	}

	async smIsMember(key: string, members: string[]) {
		const areMembers = await this.keyval.smIsMember(key, members);
		return areMembers.map(result => result !== 0);
	}

	sPop(key: string) {
		return this.keyval.sPop(key);
	}

	sRem(key: string, members: string[]) {
		if (members.length === 0) {
			return Promise.resolve(0);
		} else {
			return this.keyval.sRem(key, members);
		}
	}

	sUnionStore(key: string, keys: string[]) {
		return this.keyval.sUnionStore(key, keys);
	}

	//
	// sorted sets
	zAdd(key: string, members: [ number, string ][], options: { incr: true } & Pr.ZAdd): Promise<number | null>;
	zAdd(key: string, members: [ number, string ][], options?: Pr.ZAdd): Promise<number>;
	async zAdd(key: string, members: [ number, string ][], options?: Pr.ZAdd) {
		if (members.length === 0) {
			return 0;
		}
		const mapped = members.map(([ score, value ]) => ({ score, value }));
		const zAddOptions = options && {
			...options.if !== undefined && { condition: options.if },
			...options.up !== undefined && { comparison: options.up },
		};
		if (options?.incr) {
			return this.keyval.zAddIncr(key, mapped, zAddOptions) satisfies Promise<number | null>;
		} else {
			return this.keyval.zAdd(key, mapped, zAddOptions) satisfies Promise<number>;
		}
	}

	zCard(key: string) {
		return this.keyval.zCard(key);
	}

	zIncrBy(key: string, delta: number, member: string) {
		return this.keyval.zIncrBy(key, delta, member);
	}

	zInterStore(key: string, keys: string[], options?: Pr.ZAggregate) {
		return this.keyval.zInterStore(key, zAggregate(keys, options));
	}

	zmScore(key: string, members: string[]) {
		return this.keyval.zmScore(key, members);
	}

	zRange(key: string, min: string, max: string, options: Pr.ZRange & { by: 'LEX' }): Promise<string[]>;
	zRange(key: string, min: number, max: number, options?: Pr.ZRange): Promise<string[]>;
	zRange(key: string, min: number | string, max: number | string, options?: Pr.ZRange) {
		return this.keyval.zRange(key, min, max, zRangeOptions(options));
	}

	zRangeStore(into: string, from: string, min: number, max: number, options?: Pr.ZRange) {
		return this.keyval.zRangeStore(into, from, min, max, zRangeOptions(options));
	}

	async zRangeWithScores(key: string, min: number, max: number, options?: Pr.ZRange): Promise<[ number, string ][]> {
		const result = await this.keyval.zRangeWithScores(key, min, max, zRangeOptions(options));
		return result.map(({ score, value }) => [ score, value ]);
	}

	zRem(key: string, members: string[]) {
		return this.keyval.zRem(key, members);
	}

	zRemRange(key: string, min: number, max: number) {
		return this.keyval.zRemRangeByScore(key, min, max);
	}

	zScore(key: string, member: string) {
		return this.keyval.zScore(key, member);
	}

	zUnionStore(key: string, keys: string[], options?: Pr.ZAggregate) {
		return this.keyval.zUnionStore(key, zAggregate(keys, options));
	}

	//
	// scripting
	async eval<Result extends Value[] | Value | null, Keys extends string[], Argv extends Value[]>(
		script: Pr.KeyvalScript<Result, Keys, Argv>, keys: Keys, argv: Argv,
	): Promise<Result> {
		const { sha } = script;
		if (sha === undefined) {
			await this.load(script);
			return this.eval(script, keys, argv);
		} else {
			const result = await this.keyval.evalSha(sha, { keys, arguments: argv.map(recv) });
			if (Array.isArray(result)) {
				return result.map(value => send(value)) satisfies unknown[] as Result;
			} else {
				return send(result) as Result;
			}
		}
	}

	async load(script: Pr.KeyvalScript) {
		if (script.sha === undefined) {
			const loaded = await this.keyval.scriptLoad(script.lua!);
			// @ts-expect-error
			script.sha = loaded;
		}
	}

	//
	// management
	async flushdb() {
		await this.keyval.flushDb();
	}

	async save() {
		// redis manages it for us
	}
}
