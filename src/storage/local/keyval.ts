/* eslint-disable @typescript-eslint/require-await */
import type { KeyValProvider, SetOptions } from '../provider';
import * as Fn from 'xxscreeps/utility/functional';
import { promises as fs } from 'fs';
import { latin1ToBuffer, typedArrayToString } from 'xxscreeps/utility/string';
import { connect, create, Responder, ResponderClient, ResponderHost } from './responder';
import { SortedSet } from './sorted-set';
import { registerStorageProvider } from '..';
import { getOrSet } from 'xxscreeps/utility/utility';

registerStorageProvider([ 'file', 'local' ], 'keyval', async url => {
	try {
		return await connect(LocalKeyValProviderClient, `${url}`);
	} catch (err) {
		try {
			if (url.protocol === 'file:') {
				const payload = await fs.readFile(url, 'utf8');
				return create(LocalKeyValProviderHost, `${url}`, payload);
			}
		} catch (err) {
			// Just make a new empty store
		}
		return create(LocalKeyValProviderHost, `${url}`);
	}
});

export abstract class LocalKeyValProvider extends Responder implements KeyValProvider {
	abstract cad(key: string, check: string): Promise<number>;
	abstract copy(from: string, to: string): Promise<number>;
	abstract del(key: string): Promise<number>;
	abstract get(key: string): Promise<string | null>;
	abstract set(key: string, value: number | string | Readonly<Uint8Array>, options: { get: true } & SetOptions): Promise<string | null>;
	abstract set(key: string, value: number | string | Readonly<Uint8Array>, options: ({ nx: true } | { xx: true }) & SetOptions): Promise<undefined | null>;
	abstract set(key: string, value: number | string | Readonly<Uint8Array>, options?: SetOptions): Promise<void>;

	abstract decr(key: string): Promise<number>;
	abstract decrBy(key: string, delta: number): Promise<number>;
	abstract incr(key: string): Promise<number>;
	abstract incrBy(key: string, delta: number): Promise<number>;

	abstract lpop(key: string): Promise<string | null>;
	abstract lrange(key: string, start: number, stop: number): Promise<string[]>;
	abstract rpush(key: string, elements: string[]): Promise<number>;

	abstract sadd(key: string, members: string[]): Promise<number>;
	abstract scard(key: string): Promise<number>;
	abstract smembers(key: string): Promise<string[]>;
	abstract spop(key: string): Promise<string | null>;
	abstract srem(key: string, members: string[]): Promise<number>;

	abstract zadd(key: string, members: [ number, string ][]): Promise<number>;
	abstract zcard(key: string): Promise<number>;
	abstract zincrBy(key: string, delta: number, member: string): Promise<number>;
	abstract zmscore(key: string, members: string[]): Promise<(number | null)[]>;
	abstract zrange(key: string, min: number, max: number, byscore?: 'byScore'): Promise<string[]>;
	abstract zrem(key: string, members: string[]): Promise<number>;
	abstract zunionStore(key: string, keys: string[]): Promise<number>;

	abstract flushdb(): Promise<void>;
	abstract save(): Promise<void>;
}

class LocalKeyValProviderHost extends ResponderHost(LocalKeyValProvider) {
	private readonly data = new Map<string, any>();
	private readonly expires = new Set<string>();

	constructor(private readonly uri: string, payload?: string) {
		super(uri);
		if (payload) {
			const map = JSON.parse(payload, (key, value) => {
				switch (value?.['#']) {
					case 'map': return new Map(Object.entries(value.$));
					case 'set': return new Set(value.$);
					case 'zset': return new SortedSet(value.$);
					case 'uint8': return latin1ToBuffer(value.$);
					default: return value;
				}
			});
			if (map instanceof Map) {
				this.data = map;
			}
		}
	}

	async flushdb() {
		this.data.clear();
	}

	async save() {
		if (this.uri.startsWith('file:')) {
			const payload = JSON.stringify(this.data, (key, value) => {
				if (value === this.data) {
					return {
						'#': 'map',
						$: Object.fromEntries(Fn.reject(this.data.entries(), entry => this.expires.has(entry[0]))),
					};
				} else if (value instanceof Map) {
					return { '#': 'map', $: Object.fromEntries(value.entries()) };
				} else if (value instanceof Set) {
					return { '#': 'set', $: [ ...value ] };
				} else if (value instanceof SortedSet) {
					return { '#': 'zset', $: [ ...value.entries() ] };
				} else if (value instanceof Uint8Array) {
					return { '#': 'uint8', $: typedArrayToString(value) };
				} else {
					return value;
				}
			});
			await fs.writeFile(new URL(this.uri), payload, 'utf8');
		}
	}

	async cad(key: string, check: string) {
		if (this.data.get(key) === check) {
			this.remove(key);
			return 1;
		} else {
			return 0;
		}
	}

	async copy(from: string, to: string) {
		const value = this.data.get(from);
		if (value === undefined) {
			return 0;
		} else if (this.data.has(to)) {
			throw new Error(`"${to}" already exists`);
		} else if (value instanceof Array) {
			this.data.set(to, [ ...value ]);
		} else if (value instanceof Map) {
			this.data.set(to, new Map(value.entries()));
		} else if (value instanceof Set) {
			this.data.set(to, new Set(value));
		} else if (value instanceof SortedSet) {
			this.data.set(to, new SortedSet(value.entries()));
		} else {
			this.data.set(to, value);
		}
		return 1;
	}

	async del(key: string) {
		if (this.data.has(key)) {
			this.remove(key);
			return 1;
		} else {
			return 0;
		}
	}

	async get(key: string) {
		const value = this.data.get(key);
		return value === undefined ? null : String(value);
	}

	async set(key: string, value: number | string | Readonly<Uint8Array>, options: SetOptions = {}) {
		if (
			options.nx ? this.data.has(key) :
			options.xx ? !this.data.has(key) : false
		) {
			return null;
		}
		if (options.px) {
			this.expires.add(key);
		}
		if (options.get) {
			const current = this.data.get(key);
			this.data.set(key, value);
			return current ?? null;
		} else {
			this.data.set(key, value);
		}
	}

	decr(key: string) {
		return this.incrBy(key, -1);
	}

	decrBy(key: string, delta: number) {
		return this.incrBy(key, -delta);
	}

	incr(key: string) {
		return this.incrBy(key, 1);
	}

	async incrBy(key: string, delta: number) {
		const value = delta + (() => {
			const value = this.data.get(key);
			if (typeof value === 'number') {
				return value;
			} else if (value === undefined) {
				return 0;
			} else {
				const number = +value;
				if (Number.isNaN(number) || `${number}` !== value) {
					throw new Error(`"${key}" = ${value} is not an integer or out of range`);
				}
				return number;
			}
		})();
		this.data.set(key, value);
		return value;
	}

	async lpop(key: string) {
		const list: string[] | undefined = this.data.get(key);
		if (!list) {
			return null;
		}
		if (list.length === 1) {
			this.remove(key);
			return list[0];
		} else {
			return list.shift()!;
		}
	}

	async lrange(key: string, start: number, stop: number) {
		const list: string[] | undefined = this.data.get(key);
		if (!list) {
			return [];
		}
		return list.slice(
			start >= 0 ? start : Math.max(0, list.length + start),
			stop >= 0 ? stop + 1 : Math.max(0, list.length + stop + 1),
		);
	}

	async rpush(key: string, elements: string[]) {
		const list: string[] | undefined = this.data.get(key);
		if (list) {
			list.push(...elements);
			return list.length;
		} else {
			this.data.set(key, elements);
			return elements.length;
		}
	}

	async sadd(key: string, members: string[]) {
		const set: Set<string> | undefined = this.data.get(key);
		if (set) {
			const { size } = set;
			members.forEach(value => set.add(value));
			return set.size - size;
		} else {
			this.data.set(key, new Set(members));
			return members.length;
		}
	}

	async scard(key: string) {
		const set: Set<string> | undefined = this.data.get(key);
		return set ? set.size : 0;
	}

	async smembers(key: string) {
		const set: Set<string> | undefined = this.data.get(key);
		return set ? [ ...set ] : [];
	}

	async spop(key: string) {
		const set: Set<string> | undefined = this.data.get(key);
		if (set) {
			const { value } = set.values().next();
			if (set.size === 1) {
				this.remove(key);
			} else {
				set.delete(value);
			}
			return value as string;
		}
		return null;
	}

	async srem(key: string, members: string[]) {
		const set = this.data.get(key);
		if (set) {
			const { size } = set;
			members.forEach(value => set.delete(value));
			const result = size - set.size;
			if (result === size) {
				this.remove(key);
			}
			return result;
		} else {
			return 0;
		}
	}

	async zadd(key: string, members: [ number, string ][]) {
		const set = getOrSet<string, SortedSet<string>>(this.data, key, () => new SortedSet);
		return Fn.accumulate(members, ([ score, value ]) => set.add(value, score));
	}

	async zcard(key: string) {
		const set: SortedSet<string> | undefined = this.data.get(key);
		return set ? set.size : 0;
	}

	async zincrBy(key: string, delta: number, member: string) {
		const set = getOrSet<string, SortedSet<string>>(this.data, key, () => new SortedSet);
		const score = (set.score(member) ?? 0) + delta;
		set.add(member, score);
		return score;
	}

	async zmscore(key: string, members: string[]) {
		const set: SortedSet<string> | undefined = this.data.get(key);
		if (set) {
			return members.map(member => set.score(member) ?? null);
		} else {
			return members.map(() => null);
		}
	}

	async zrange(key: string, min: number, max: number, byscore?: 'byScore'): Promise<string[]> {
		const set: SortedSet<string> | undefined = this.data.get(key);
		if (set) {
			if (byscore === 'byScore') {
				return [ ...Fn.map(set.entries(min, max), entry => entry[0]) ];
			} else {
				return set.values().slice(min, max);
			}
		} else {
			return [];
		}
	}

	async zrem(key: string, members: string[]) {
		const set: SortedSet<string> | undefined = this.data.get(key);
		if (set) {
			return Fn.accumulate(members, member => set.delete(member));
		} else {
			return 0;
		}
	}

	async zunionStore(key: string, keys: string[]) {
		const sets: (SortedSet<string> | undefined)[] = keys.map(key => this.data.get(key));
		if (sets.every(set => set === undefined)) {
			return 0;
		}
		const out = new SortedSet;
		this.data.set(key, out);
		out.merge(Fn.concat(Fn.map(sets, set => {
			if (set) {
				return set.entries();
			} else {
				return [];
			}
		})));
		return out.size;
	}

	private remove(key: string) {
		this.data.delete(key);
		this.expires.delete(key);
	}
}

class LocalKeyValProviderClient extends ResponderClient(LocalKeyValProvider) {
	cad(key: string, check: string) {
		return this.request('cad', key, check);
	}

	copy(from: string, to: string) {
		return this.request('copy', from, to);
	}

	del(key: string) {
		return this.request('del', key);
	}

	get(key: string) {
		return this.request('get', key);
	}

	set(key: string, value: Readonly<Uint8Array>, options?: SetOptions) {
		return this.request('set' as any, key, value, options);
	}

	decr(key: string) {
		return this.request('decr', key);
	}

	decrBy(key: string, delta: number) {
		return this.request('decrBy', key, delta);
	}

	incr(key: string) {
		return this.request('incr', key);
	}

	incrBy(key: string, delta: number) {
		return this.request('incrBy', key, delta);
	}

	lpop(key: string) {
		return this.request('lpop', key);
	}

	lrange(key: string, start: number, stop: number) {
		return this.request('lrange', key, start, stop);
	}

	rpush(key: string, elements: string[]) {
		return this.request('rpush', key, elements);
	}

	sadd(key: string, members: string[]) {
		return this.request('sadd', key, members);
	}

	scard(key: string) {
		return this.request('scard', key);
	}

	smembers(key: string) {
		return this.request('smembers', key);
	}

	spop(key: string) {
		return this.request('spop', key);
	}

	srem(key: string, members: string[]) {
		return this.request('srem', key, members);
	}

	zadd(key: string, members: [ number, string ][]) {
		return this.request('zadd', key, members);
	}

	zcard(key: string) {
		return this.request('zcard', key);
	}

	zincrBy(key: string, delta: number, member: string) {
		return this.request('zincrBy', key, delta, member);
	}

	zmscore(key: string, members: string[]) {
		return this.request('zmscore', key, members);
	}

	zrange(key: string, min: number, max: number, extra?: 'byScore' | 'withScores') {
		return this.request('zrange' as any, key,
			min === -Infinity ? Number.MIN_SAFE_INTEGER : min,
			max === Infinity ? Number.MAX_SAFE_INTEGER : max,
			extra);
	}

	zrem(key: string, members: string[]) {
		return this.request('zrem', key, members);
	}

	zunionStore(key: string, keys: string[]) {
		return this.request('zunionStore', key, keys);
	}

	flushdb() {
		return this.request('flushdb');
	}

	save() {
		return this.request('save');
	}
}
