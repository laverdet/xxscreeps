export type EphemeralProvider = {
	// queues & rudimentary locks
	sadd(key: string, values: string[]): Promise<number>;
	spop(key: string): Promise<string | undefined>;
	sflush(key: string): Promise<void>;
	disconnect(): void;
};

export type PersistenceProvider = {
	// key/val
	del(key: string): Promise<void>;
	get(key: string): Promise<Readonly<Uint8Array>>;
	set(key: string, value: Readonly<Uint8Array>): Promise<void>;
	save(): Promise<void>;
	disconnect(): void;
};

export type PubsubProvider = {
	// pub/sub
	publish(key: string, message: string): Promise<void>;
	subscribe(key: string, listener: (message: string) => void): Promise<() => void>;
};

export class Provider {
	constructor(
		public readonly ephemeral: EphemeralProvider,
		public readonly persistence: PersistenceProvider,
	) {}

	disconnect() {
		this.ephemeral.disconnect();
		this.persistence.disconnect();
	}
}
