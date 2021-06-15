export type Copy = { if?: 'nx' };
export type Set = {
	if?: 'nx' | 'xx';
	get?: boolean;
	px?: number;
};
export type HSet = {
	if?: 'nx';
};
export type ZAdd = {
	if?: 'nx' | 'xx';
};
export type ZRange = {
	by?: 'lex' | 'score';
};

export type BlobProvider = {
	copy(from: string, to: string, options?: Copy): Promise<boolean>;
	del(key: string): Promise<boolean>;
	getBuffer(key: string): Promise<Readonly<Uint8Array> | null>;
	reqBuffer(key: string): Promise<Readonly<Uint8Array>>;
	set(key: string, value: Readonly<Uint8Array>): Promise<void>;
	flushdb(): Promise<void>;
	save(): Promise<void>;
};

export type Value = number | string;
export type KeyValProvider = {
	// keys / strings
	cad(key: string, check: string): Promise<boolean>;
	cas(key: string, expected: Value, desired: Value): Promise<boolean>;
	copy(from: string, to: string, options?: Copy): Promise<boolean>;
	del(key: string): Promise<boolean>;
	get(key: string): Promise<string | null>;
	set(key: string, value: Value | Readonly<Uint8Array>, options: { get: true } & Set): Promise<string | null>;
	set(key: string, value: Value | Readonly<Uint8Array>, options: { if: string } & Set): Promise<undefined | null>;
	set(key: string, value: Value | Readonly<Uint8Array>, options?: Set): Promise<void>;
	// numbers
	decr(key: string): Promise<number>;
	decrBy(key: string, value: number): Promise<number>;
	incr(key: string): Promise<number>;
	incrBy(key: string, value: number): Promise<number>;
	// hashes
	hget(key: string, field: string): Promise<string | null>;
	hgetall(key: string): Promise<Record<string, string>>;
	hincrBy(key: string, field: string, value: number): Promise<number>;
	hmget(key: string, fields: string[]): Promise<Record<string, string | null>>;
	hset(key: string, field: string, value: Value, options?: HSet): Promise<boolean>;
	hmset(key: string, fields: [ string, Value ][] | Record<string, Value>): Promise<void>;
	// lists
	lpop(key: string): Promise<string | null>;
	lrange(key: string, start: number, stop: number): Promise<string[]>;
	rpush(key: string, elements: Value[]): Promise<number>;
	// sets
	sadd(key: string, members: string[]): Promise<number>;
	scard(key: string): Promise<number>;
	sismember(key: string, member: string): Promise<boolean>;
	smembers(key: string): Promise<string[]>;
	spop(key: string): Promise<string | null>;
	srem(key: string, members: string[]): Promise<number>;
	// sorted sets
	zadd(key: string, members: [ number, string ][], options?: ZAdd): Promise<number>;
	zcard(key: string): Promise<number>;
	zincrBy(key: string, delta: number, member: string): Promise<number>;
	zmscore(key: string, members: string[]): Promise<(number | null)[]>;
	zrange(key: string, min: string, max: string, options: ZRange & { by: 'lex' }): Promise<string[]>;
	zrange(key: string, min: number, max: number, options?: ZRange): Promise<string[]>;
	zrangeWithScores(key: string, min: number, max: number, options?: ZRange): Promise<[ number, string ][]>;
	zrem(key: string, members: string[]): Promise<number>;
	zremRange(key: string, min: number, max: number): Promise<number>;
	zunionStore(key: string, keys: string[]): Promise<number>;
	// client
	flushdb(): Promise<void>;
	save(): Promise<void>;
};

export type PubSubProvider = {
	// pub/sub
	publish(key: string, message: string): Promise<void>;
	subscribe(key: string, listener: PubSubListener): Promise<PubSubSubscription>;
};

export type PubSubListener = (message: string) => void;

export type PubSubSubscription = {
	disconnect(): void;
	// publishing from a subscription will not send that message to your listener
	publish(message: string): Promise<void>;
};
