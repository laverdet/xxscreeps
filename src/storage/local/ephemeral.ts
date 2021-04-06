import type { EphemeralProvider } from '../provider';
import { create, connect, Responder, ResponderClient, ResponderHost } from './responder';

export abstract class LocalEphemeralProvider extends Responder implements EphemeralProvider {
	abstract sadd(key: string, values: string[]): Promise<number>;
	abstract spop(key: string): Promise<string | undefined>;
	abstract sflush(key: string): Promise<void>;
	abstract srem(key: string, values: string[]): Promise<number>;
	protected foo = 1;

	// eslint-disable-next-line @typescript-eslint/require-await
	static async create(name: string) {
		return create(LocalEphemeralProviderHost, `ephemeral://${name}`);
	}

	static connect(name: string) {
		return connect(LocalEphemeralProviderClient, `ephemeral://${name}`);
	}
}

class LocalEphemeralProviderHost extends ResponderHost(LocalEphemeralProvider) {
	private readonly keys = new Map<string, Set<string>>();

	// eslint-disable-next-line @typescript-eslint/require-await
	async sadd(key: string, values: string[]) {
		const set = this.keys.get(key);
		if (set) {
			const { size } = set;
			values.forEach(value => set.add(value));
			return set.size - size;
		} else {
			this.keys.set(key, new Set(values));
			return values.length;
		}
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async spop(key: string) {
		const set = this.keys.get(key);
		if (set) {
			const { value } = set.values().next();
			if (set.size === 1) {
				this.keys.delete(key);
			} else {
				set.delete(value);
			}
			return value;
		}
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async sflush(key: string) {
		this.keys.delete(key);
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async srem(key: string, values: string[]) {
		const set = this.keys.get(key);
		if (set) {
			const { size } = set;
			values.forEach(value => set.delete(value));
			const result = size - set.size;
			if (result === size) {
				this.keys.delete(key);
			}
			return result;
		} else {
			return 0;
		}
	}
}

class LocalEphemeralProviderClient extends ResponderClient(LocalEphemeralProvider) {
	sadd(key: string, values: string[]) {
		return this.request('sadd', key, values);
	}

	spop(key: string) {
		return this.request('spop', key);
	}

	sflush(key: string) {
		return this.request('sflush', key);
	}

	srem(key: string, values: string[]) {
		return this.request('srem', key, values);
	}
}
