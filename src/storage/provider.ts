export type EphemeralProvider = {
	// blobs
	del(key: string): Promise<void>;
	get(key: string): Promise<Readonly<Uint8Array>>;
	set(key: string, value: Readonly<Uint8Array>): Promise<void>;
	// lists
	clear(key: string): Promise<void>;
	lpop(key: string, count: number): Promise<Readonly<Uint8Array>[]>;
	rpush(key: string, values: Readonly<Uint8Array>[]): Promise<void>;
	// sets
	sadd(key: string, values: string[]): Promise<number>;
	spop(key: string): Promise<string | undefined>;
	sflush(key: string): Promise<void>;
	srem(key: string, values: string[]): Promise<number>;
	// client
	disconnect(): void;
};

export type PersistenceProvider = {
	// key/val
	del(key: string): Promise<void>;
	get(key: string): Promise<Readonly<Uint8Array>>;
	set(key: string, value: Readonly<Uint8Array>): Promise<void>;
	copy(from: string, to: string): Promise<void>;
	save(): Promise<void>;
	disconnect(): void;
};

export type PubsubProvider = {
	// pub/sub
	publish(key: string, message: string): Promise<void>;
	subscribe(key: string, listener: PubsubListener): Promise<PubsubSubscription>;
	disconnect(): void;
};

export type PubsubListener = (message: string) => void;

export type PubsubSubscription = {
	disconnect(): void;
	// publishing from a subscription will not send that message to your listener
	publish(message: string): Promise<void>;
};

export class Provider {
	constructor(
		public readonly ephemeral: EphemeralProvider,
		public readonly persistence: PersistenceProvider,
		public readonly pubsub: PubsubProvider,
	) {}

	disconnect() {
		this.ephemeral.disconnect();
		this.persistence.disconnect();
		this.pubsub.disconnect();
	}
}
