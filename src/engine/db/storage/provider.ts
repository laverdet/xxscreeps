import type { Effect } from 'xxscreeps/utility/types';
import type { KeyvalScript } from './script';
export type { KeyvalScript };

export type AsBlob = { blob?: boolean };
export type Copy = { if?: 'nx' };
export type Set = {
	if?: 'nx' | 'xx';
	get?: boolean;
	px?: number;
	// Flag which announces that the client will retain and modify the buffer after invocation. A
	// network provider would be able to simply write the buffer to the wire, but the default local
	// provider needs to make a copy.
	retain?: boolean;
};
export type HSet = {
	if?: 'nx';
};
export type ZAdd = {
	if?: 'nx' | 'xx';
	incr?: boolean;
};
export type ZAggregate = {
	// aggregate: 'sum' | 'min' | 'max';
	weights?: number[];
};
export type ZRange = {
	by?: 'lex' | 'score';
	limit?: [ number, number ];
};

export type Value = number | string | Readonly<Uint8Array>;
export type KeyValProvider = {
	// keys / strings
	copy(from: string, to: string, options?: Copy): Promise<boolean>;
	del(key: string): Promise<boolean>;
	get(key: string, options: { blob: true }): Promise<Readonly<Uint8Array> | null>;
	get(key: string, options?: AsBlob): Promise<string | null>;
	req(key: string, options: { blob: true }): Promise<Readonly<Uint8Array>>;
	req(key: string, options?: AsBlob): Promise<string>;
	set(key: string, value: Value, options: { get: true } & Set): Promise<string | null>;
	set(key: string, value: Value, options: { if: string } & Set): Promise<undefined | null>;
	set(key: string, value: Value, options?: Set): Promise<void>;
	// numbers
	decr(key: string): Promise<number>;
	decrBy(key: string, value: number): Promise<number>;
	incr(key: string): Promise<number>;
	incrBy(key: string, value: number): Promise<number>;
	// hashes
	hget(key: string, field: string): Promise<string | null>;
	hgetall(key: string): Promise<Record<string, string>>;
	hincrBy(key: string, field: string, value: number): Promise<number>;
	hmget(key: string, fields: string[], options: { blob: true }): Promise<Record<string, Readonly<Uint8Array> | null>>;
	hmget(key: string, fields: string[], options?: AsBlob): Promise<Record<string, string | null>>;
	hset(key: string, field: string, value: Value, options?: HSet): Promise<boolean>;
	hmset(key: string, fields: [ string, Value ][] | Record<string, Value>): Promise<void>;
	// lists
	lpop(key: string): Promise<string | null>;
	lrange(key: string, start: number, stop: number): Promise<string[]>;
	rpush(key: string, elements: Value[]): Promise<number>;
	// sets
	sadd(key: string, members: string[]): Promise<number>;
	scard(key: string): Promise<number>;
	sdiff(key: string, keys: string[]): Promise<string[]>;
	sinter(key: string, keys: string[]): Promise<string[]>;
	sismember(key: string, member: string): Promise<boolean>;
	smismember(key: string, members: string[]): Promise<boolean[]>;
	smembers(key: string): Promise<string[]>;
	spop(key: string): Promise<string | null>;
	srem(key: string, members: string[]): Promise<number>;
	sunionStore(key: string, keys: string[]): Promise<number>;
	// sorted sets
	zadd(key: string, members: [ number, string ][], options: { incr: true } & ZAdd): Promise<number | null>;
	zadd(key: string, members: [ number, string ][], options?: ZAdd): Promise<number>;
	zcard(key: string): Promise<number>;
	zincrBy(key: string, delta: number, member: string): Promise<number>;
	zinterStore(key: string, keys: string[], options?: ZAggregate): Promise<number>;
	zmscore(key: string, members: string[]): Promise<(number | null)[]>;
	zrange(key: string, min: string, max: string, options: ZRange & { by: 'lex' }): Promise<string[]>;
	zrange(key: string, min: number, max: number, options?: ZRange): Promise<string[]>;
	zrangeStore(into: string, from: string, min: number, max: number, options?: ZRange): Promise<number>;
	zrangeWithScores(key: string, min: number, max: number, options?: ZRange): Promise<[ number, string ][]>;
	zrem(key: string, members: string[]): Promise<number>;
	zremRange(key: string, min: number, max: number): Promise<number>;
	zscore(key: string, member: string): Promise<number | null>;
	zunionStore(key: string, keys: string[], options?: ZAggregate): Promise<number>;
	// scripting
	eval<Result extends Value[] | Value | null, Keys extends string[], Argv extends Value[]>(script: KeyvalScript<Result, Keys, Argv>, keys: Keys, argv: Argv): Promise<Result>;
	load(script: KeyvalScript): Promise<void>;
	// management
	flushdb(): Promise<void>;
	save(): Promise<void>;
};

export type PubSubProvider = {
	// pub/sub
	publish(key: string, message: string): Promise<void>;
	subscribe(key: string, listener: PubSubListener): Promise<readonly [ Effect, PubSubSubscription ]>;
};

export type PubSubListener = (message: string) => void;

export type PubSubSubscription = {
	// publishing from a subscription will not send that message to your listener
	publish(message: string): Promise<void>;
};
