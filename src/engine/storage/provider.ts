export type BlobProvider = {
	del(key: string): Promise<number>;
	getBuffer(key: string): Promise<Readonly<Uint8Array> | null>;
	reqBuffer(key: string): Promise<Readonly<Uint8Array>>;
	set(key: string, value: Readonly<Uint8Array>): Promise<void>;
	copy(from: string, to: string): Promise<number>;
	flushdb(): Promise<void>;
	save(): Promise<void>;
	disconnect(): void;
};

export type SetOptions = ({
	nx?: true;
	xx?: never;
} | {
	nx?: never;
	xx?: true;
}) & {
	get?: boolean;
	px?: number;
};

export type ZRangeOptions = {
	by?: 'score' | 'lex';
	withScores?: boolean;
};

export type Value = number | string;
export type KeyValProvider = {
	// keys / strings
	cad(key: string, check: string): Promise<number>;
	copy(from: string, to: string): Promise<number>;
	del(key: string): Promise<number>;
	get(key: string): Promise<string | null>;
	set(key: string, value: Value | Readonly<Uint8Array>, options: { get: true } & SetOptions): Promise<string | null>;
	set(key: string, value: Value | Readonly<Uint8Array>, options: ({ nx: true } | { xx: true }) & SetOptions): Promise<undefined | null>;
	set(key: string, value: Value | Readonly<Uint8Array>, options?: SetOptions): Promise<void>;
	// numbers
	decr(key: string): Promise<number>;
	decrBy(key: string, value: number): Promise<number>;
	incr(key: string): Promise<number>;
	incrBy(key: string, value: number): Promise<number>;
	// hashes
	hget(key: string, field: string): Promise<string | null>;
	hgetall(key: string): Promise<Record<string, string>>;
	hmget(key: string, fields: Iterable<string>): Promise<Record<string, string | null>>;
	hset(key: string, field: string, value: Value, options?: { nx: boolean }): Promise<number>;
	hmset(key: string, fields: Iterable<[ string, Value ]> | Record<string, Value>): Promise<number>;
	// lists
	lpop(key: string): Promise<string | null>;
	lrange(key: string, start: number, stop: number): Promise<string[]>;
	rpush(key: string, elements: Value[]): Promise<number>;
	// sets
	sadd(key: string, members: string[]): Promise<number>;
	scard(key: string): Promise<number>;
	sismember(key: string, member: string): Promise<number>;
	smembers(key: string): Promise<string[]>;
	spop(key: string): Promise<string | null>;
	srem(key: string, members: string[]): Promise<number>;
	// sorted sets
	zadd(key: string, members: [ number, string ][]): Promise<number>;
	zcard(key: string): Promise<number>;
	zincrBy(key: string, delta: number, member: string): Promise<number>;
	zmscore(key: string, members: string[]): Promise<(number | null)[]>;
	zrange(key: string, min: number, max: number, options: ZRangeOptions & { withScores: true }): Promise<[ number, string ][]>;
	zrange(key: string, min: number, max: number, options?: ZRangeOptions): Promise<string[]>;
	zrange(key: string, min: string, max: string, options?: ZRangeOptions): Promise<string[]>;
	zrem(key: string, members: string[]): Promise<number>;
	zunionStore(key: string, keys: string[]): Promise<number>;
	// client
	disconnect(): void;
	flushdb(): Promise<void>;
	save(): Promise<void>;
};

export type PubSubProvider = {
	// pub/sub
	publish(key: string, message: string): Promise<void>;
	subscribe(key: string, listener: PubSubListener): Promise<PubSubSubscription>;
	disconnect(): void;
};

export type PubSubListener = (message: string) => void;

export type PubSubSubscription = {
	disconnect(): void;
	// publishing from a subscription will not send that message to your listener
	publish(message: string): Promise<void>;
};
