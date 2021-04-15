export type BlobProvider = {
	del(key: string): Promise<void>;
	getBuffer(key: string): Promise<Readonly<Uint8Array>>;
	set(key: string, value: Readonly<Uint8Array>): Promise<void>;
	copy(from: string, to: string): Promise<void>;
	save(): Promise<void>;
	disconnect(): void;
};

export type KeyValProvider = {
	// keys / strings
	copy(from: string, to: string): Promise<number>;
	del(key: string): Promise<void>;
	get(key: string): Promise<string | null>;
	getBuffer(key: string): Promise<Readonly<Uint8Array>>;
	set(key: string, value: number | string | Readonly<Uint8Array>): Promise<void>;
	set(key: string, value: number | string | Readonly<Uint8Array>, get: 'get'): Promise<string>;
	// numbers
	decr(key: string): Promise<number>;
	decrBy(key: string, value: number): Promise<number>;
	incr(key: string): Promise<number>;
	incrBy(key: string, value: number): Promise<number>;
	// lists
	lpop(key: string, count: number): Promise<string[]>;
	rpush(key: string, elements: string[]): Promise<void>;
	// sets
	sadd(key: string, members: string[]): Promise<number>;
	scard(key: string): Promise<number>;
	smembers(key: string): Promise<string[]>;
	spop(key: string): Promise<string | undefined>;
	srem(key: string, members: string[]): Promise<number>;
	// sorted sets
	zadd(key: string, members: [ number, string ][]): Promise<number>;
	zcard(key: string): Promise<number>;
	zincrBy(key: string, delta: number, member: string): Promise<number>;
	zrange(key: string, min: number, max: number, byscore?: 'byscore'): Promise<string[]>;
	zrem(key: string, members: string[]): Promise<number>;
	zunionStore(key: string, keys: string[]): Promise<number>;
	// client
	disconnect(): void;
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
