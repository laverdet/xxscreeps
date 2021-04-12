/* eslint-disable @typescript-eslint/require-await */
import type { EphemeralProvider } from '../provider';
import { create, connect, Responder, ResponderClient, ResponderHost } from './responder';

export abstract class LocalEphemeralProvider extends Responder implements EphemeralProvider {
	abstract del(key: string): Promise<void>;
	abstract get(key: string): Promise<Readonly<Uint8Array>>;
	abstract set(key: string, value: Readonly<Uint8Array>): Promise<void>;

	abstract clear(key: string): Promise<void>;
	abstract lpop(key: string, count: number): Promise<Readonly<Uint8Array>[]>;
	abstract rpush(key: string, values: Readonly<Uint8Array>[]): Promise<void>;

	abstract sadd(key: string, values: string[]): Promise<number>;
	abstract spop(key: string): Promise<string | undefined>;
	abstract sflush(key: string): Promise<void>;
	abstract srem(key: string, values: string[]): Promise<number>;

	static async create(name: string) {
		return create(LocalEphemeralProviderHost, `ephemeral://${name}`);
	}

	static connect(name: string) {
		return connect(LocalEphemeralProviderClient, `ephemeral://${name}`);
	}
}

class LocalEphemeralProviderHost extends ResponderHost(LocalEphemeralProvider) {
	private readonly blobs = new Map<string, Readonly<Uint8Array>>();
	private readonly lists = new Map<string, Readonly<Uint8Array>[]>();
	private readonly sets = new Map<string, Set<string>>();

	async del(key: string) {
		this.blobs.delete(key);
	}

	async get(key: string): Promise<Readonly<Uint8Array>> {
		const blob = this.blobs.get(key);
		if (blob) {
			return blob;
		} else {
			throw new Error('Blob does not exist');
		}
	}

	async set(key: string, value: Readonly<Uint8Array>) {
		this.blobs.set(key, value);
	}

	async clear(key: string) {
		this.lists.delete(key);
	}

	async lpop(key: string, count: number) {
		const list = this.lists.get(key);
		if (!list) {
			return [];
		}
		if (count === -1 || count <= list.length) {
			this.lists.delete(key);
			return list;
		} else {
			return list.splice(0, count);
		}
	}

	async rpush(key: string, values: Readonly<Uint8Array>[]) {
		const list = this.lists.get(key);
		if (list) {
			list.push(...values);
		} else {
			this.lists.set(key, values);
		}
	}

	async sadd(key: string, values: string[]) {
		const set = this.sets.get(key);
		if (set) {
			const { size } = set;
			values.forEach(value => set.add(value));
			return set.size - size;
		} else {
			this.sets.set(key, new Set(values));
			return values.length;
		}
	}

	async spop(key: string) {
		const set = this.sets.get(key);
		if (set) {
			const { value } = set.values().next();
			if (set.size === 1) {
				this.sets.delete(key);
			} else {
				set.delete(value);
			}
			return value;
		}
	}

	async sflush(key: string) {
		this.sets.delete(key);
	}

	async srem(key: string, values: string[]) {
		const set = this.sets.get(key);
		if (set) {
			const { size } = set;
			values.forEach(value => set.delete(value));
			const result = size - set.size;
			if (result === size) {
				this.sets.delete(key);
			}
			return result;
		} else {
			return 0;
		}
	}
}

class LocalEphemeralProviderClient extends ResponderClient(LocalEphemeralProvider) {
	del(key: string) {
		return this.request('del', key);
	}

	get(key: string) {
		return this.request('get', key);
	}

	set(key: string, value: Readonly<Uint8Array>) {
		return this.request('set', key, value);
	}

	clear(key: string) {
		return this.request('clear', key);
	}

	lpop(key: string, count: number) {
		return this.request('lpop', key, count);
	}

	rpush(key: string, values: Buffer[]) {
		return this.request('rpush', key, values);
	}

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
