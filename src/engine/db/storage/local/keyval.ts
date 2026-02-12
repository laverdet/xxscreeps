/* eslint-disable @typescript-eslint/require-await */
import type * as P from 'xxscreeps/engine/db/storage/provider.js';
import type { KeyvalScript } from 'xxscreeps/engine/db/storage/script.js';
import type { MaybePromises } from './responder.js';
import fs from 'fs/promises';
import Fn from 'xxscreeps/utility/functional.js';
import { latin1ToBuffer, typedArrayToString } from 'xxscreeps/utility/string.js';
import { connect, makeClient, makeHost } from './responder.js';
import { SortedSet } from './sorted-set.js';
import { registerStorageProvider } from 'xxscreeps/engine/db/storage/index.js';
import { getOrSet } from 'xxscreeps/utility/utility.js';
import { BlobStorage } from './blob.js';

registerStorageProvider([ 'file', 'local' ], 'keyval', url => {
	const path = url.pathname.endsWith('/') ? url : new URL(`${url}/`);
	return connect(`${path}`, LocalKeyValClient, LocalKeyValHost, () =>
		LocalKeyValResponder.create(path));
});

export class LocalKeyValResponder implements MaybePromises<P.KeyValProvider> {
	private readonly data = new Map<string, any>();
	private readonly expires = new Set<string>();
	private readonly scripts = new Map<string, (instance: LocalKeyValResponder, keys: string[], argv: P.Value[]) => any>();

	constructor(
		private readonly url: URL | undefined,
		private readonly blob: BlobStorage,
		payload: string | undefined,
	) {
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

	static async create(path: URL) {
		const [ blobEffect, blob ] = await BlobStorage.create(path);
		const [ url, payload ] = await async function() {
			if (path.protocol === 'file:') {
				const url = new URL('data.json', path);
				return [
					url,
					await async function() {
						try {
							return await fs.readFile(new URL('data.json', path), 'utf8');
						} catch {}
					}(),
				] as const;
			}
			return [];
		}();
		const host = new LocalKeyValResponder(url, blob, payload);
		return [ blobEffect, host ] as const;
	}

	copy(from: string, to: string, options?: P.Copy) {
		const value = this.data.get(from);
		if (value === undefined) {
			return this.blob.copy(from, to, options) as never;
		} else if (options?.if === 'nx' && this.data.has(to)) {
			return false;
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
		return true;
	}

	del(key: string) {
		if (this.data.has(key)) {
			this.remove(key);
			return true;
		} else {
			return this.blob.del(key) as never;
		}
	}

	vdel(key: string) {
		this.del(key);
	}

	get(key: string, options?: P.AsBlob) {
		if (options?.blob) {
			return this.blob.get(key) as never;
		} else {
			const value = this.data.get(key);
			return value === undefined ? null : String(value);
		}
	}

	req(key: string, options?: P.AsBlob) {
		if (options?.blob) {
			return this.blob.req(key) as never;
		} else {
			const value = this.get(key);
			if (value === null) {
				throw new Error(`"${key}" does not exist`);
			}
			return value;
		}
	}

	set(key: string, value: P.Value, options?: P.Set): any {
		if (ArrayBuffer.isView(value)) {
			return this.blob.set(key, value, options) as never;
		}
		if (
			options?.if === 'nx' ? this.data.has(key) :
			options?.if === 'xx' ? !this.data.has(key) : false
		) {
			return null;
		}
		if (options?.px) {
			this.expires.add(key);
		}
		if (options?.get) {
			const current = this.data.get(key);
			this.data.set(key, value);
			return current === undefined ? null : `${current}`;
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

	incrBy(key: string, delta: number) {
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

	hget(key: string, field: string) {
		const map: Map<string, string> | undefined = this.data.get(key);
		return map?.get(field) ?? null;
	}

	hgetall(key: string) {
		const map: Map<string, string> | undefined = this.data.get(key);
		return map ? Fn.fromEntries(map.entries()) : {};
	}

	hincrBy(key: string, field: string, value: number) {
		const map: Map<string, any> = getOrSet(this.data, key, () => new Map);
		const result = (Number(map.get(field)) || 0) + value;
		map.set(field, result);
		return result;
	}

	hmget(key: string, fields: Iterable<string>) {
		const map: Map<string, string | Readonly<Uint8Array>> | undefined = this.data.get(key);
		return Fn.fromEntries(Fn.map(fields, field => [ field, map?.get(field) ?? null ])) as never;
	}

	hset(key: string, field: string, value: P.Value, options?: P.HSet) {
		const map: Map<string, any> = getOrSet(this.data, key, () => new Map);
		const has = map.has(field);
		if (options?.if === 'nx' && has) {
			return false;
		} else {
			map.set(field, value);
			return !has;
		}
	}

	hmset(key: string, fields: Iterable<readonly [ string, P.Value ]> | Record<string, P.Value>) {
		const map: Map<string, any> = getOrSet(this.data, key, () => new Map);
		const iterable = Symbol.iterator in fields ?
			fields as Iterable<[ string, P.Value ]> :
			Object.entries(fields);
		for (const [ field, value ] of iterable) {
			map.set(field, value);
		}
	}

	lpop(key: string) {
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

	lrange(key: string, start: number, stop: number) {
		const list: string[] | undefined = this.data.get(key);
		if (!list) {
			return [];
		}
		return list.slice(
			start >= 0 ? start : Math.max(0, list.length + start),
			stop >= 0 ? stop + 1 : Math.max(0, list.length + stop + 1),
		);
	}

	rpush(key: string, elements: P.Value[]) {
		const list: string[] | undefined = this.data.get(key);
		const strings = Fn.map(elements, element => element) as string[];
		if (list) {
			list.push(...strings);
			return list.length;
		} else {
			this.data.set(key, [ ...strings ]);
			return elements.length;
		}
	}

	sadd(key: string, members: string[]) {
		const set: Set<string> | undefined = this.data.get(key);
		if (set) {
			const { size } = set;
			members.forEach(value => set.add(value));
			return set.size - size;
		} else if (members.length) {
			this.data.set(key, new Set(members));
			return members.length;
		} else {
			return 0;
		}
	}

	scard(key: string) {
		const set: Set<string> | undefined = this.data.get(key);
		return set ? set.size : 0;
	}

	sdiff(key: string, keys: string[]) {
		const set: Set<string> | undefined = this.data.get(key);
		if (set) {
			const sets: (Set<string> | undefined)[] = keys.map(key => this.data.get(key));
			return [ ...Fn.reject(set, member => sets.some(set => set?.has(member))) ];
		} else {
			return [];
		}
	}

	sinter(key: string, keys: string[]) {
		const sets = [ ...Fn.filter(Fn.map(
			Fn.concat([ key ], keys),
			(key): Set<string> | undefined => this.data.get(key))) ];
		sets.sort((left, right) => left.size - right.size);
		const first = sets.shift();
		if (sets.length > 0) {
			return [ ...Fn.filter(first!, member => sets.every(set => set.has(member))) ];
		} else {
			return [];
		}
	}

	sismember(key: string, member: string) {
		const set: Set<string> | undefined = this.data.get(key);
		return set?.has(member) ?? false;
	}

	smismember(key: string, members: string[]) {
		const set: Set<string> | undefined = this.data.get(key);
		if (set) {
			return members.map(member => set.has(member));
		} else {
			return members.map(() => false);
		}
	}

	smembers(key: string) {
		const set: Set<string> | undefined = this.data.get(key);
		return set ? [ ...set ] : [];
	}

	spop(key: string) {
		const set: Set<string> | undefined = this.data.get(key);
		if (set) {
			const { value } = set.values().next();
			if (value === undefined) {
				return null;
			}
			if (set.size === 1) {
				this.remove(key);
			} else {
				set.delete(value);
			}
			return value;
		}
		return null;
	}

	srem(key: string, members: string[]) {
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

	sunionStore(key: string, keys: string[]) {
		const sets = [ ...Fn.filter(Fn.map(keys, (key): Set<string> => this.data.get(key))) ];
		const out = new Set(Fn.concat(sets));
		this.data.set(key, out);
		return out.size;
	}

	zadd(key: string, members: [ number, string ][], options?: P.ZAdd): any {
		const set = getOrSet<string, SortedSet>(this.data, key, () => new SortedSet);
		try {
			const range = function() {
				switch (options?.if) {
					case 'nx': return Fn.reject(members, member => set.has(member[1]));
					case 'xx': return Fn.filter(members, member => set.has(member[1]));
					default: return members;
				}
			}();

			if (options?.incr) {
				if (members.length > 1) {
					throw new Error('ZADD with INCR option cannot be used with multiple elements');
				}
				const { head } = Fn.shift(range);
				if (!head) {
					return null;
				}
				const score = set.score(head[1]);
				if (score === undefined) {
					return null;
				} else {
					const result = score + head[0];
					set.add(head[1], result);
					return result;
				}
			}

			return set.insert(range, (left, right) => right);
		} finally {
			if (set.size === 0) {
				this.data.delete(key);
			}
		}
	}

	zcard(key: string) {
		const set: SortedSet | undefined = this.data.get(key);
		return set ? set.size : 0;
	}

	zincrBy(key: string, delta: number, member: string) {
		const set = getOrSet<string, SortedSet>(this.data, key, () => new SortedSet);
		const score = (set.score(member) ?? 0) + delta;
		set.add(member, score);
		return score;
	}

	zinterStore(key: string, keys: string[], options?: P.ZAggregate) {
		// Fetch sets first because you can use this command to store a set back into itself
		const sets = [ ...Fn.filter(Fn.map(keys, (key): SortedSet => this.data.get(key))) ];
		const out = function() {
			const smallest = Fn.minimum(sets, (left, right) => left.size - right.size);
			if (!smallest) {
				return new SortedSet;
			}

			// Generate intersection
			const weights = options?.weights ?? [ ...Fn.map(sets, () => 1) ];
			return new SortedSet(function *(): Iterable<[ number, string ]> {
				loop: for (const member of smallest.values()) {
					let nextScore = 0;
					for (let ii = 0; ii < sets.length; ++ii) {
						const score = sets[ii].score(member);
						if (score === undefined) {
							continue loop;
						}
						nextScore += score * weights[ii];
					}
					yield [ nextScore, member ];
				}
			}());
		}();

		// Save result
		if (out.size > 0) {
			this.data.set(key, out);
		} else {
			this.data.delete(key);
		}
		return out.size;
	}

	zmscore(key: string, members: string[]) {
		const set: SortedSet | undefined = this.data.get(key);
		if (set) {
			return members.map(member => set.score(member) ?? null);
		} else {
			return members.map(() => null);
		}
	}

	zrange(key: string, min: number | string, max: number | string, options?: P.ZRange): any {
		const set: SortedSet | undefined = this.data.get(key);
		if (set) {
			const allMatching = function() {
				switch (options?.by) {
					case 'lex': {
						const parse = (value: string): [ string, boolean ] => {
							if (value === '-') {
								return [ '', true ];
							} else if (value === '+') {
								return [ '\uffff', true ];
							} else if (value.startsWith('(')) {
								return [ value.substr(1), false ];
							} else if (value.startsWith('[')) {
								return [ value.substr(1), true ];
							} else {
								throw new Error(`Invalid range: ${value}`);
							}
						};
						const [ minVal, minInc ] = parse(min as string);
						const [ maxVal, maxInc ] = parse(max as string);
						return [ ...set.entriesByLex(minInc, minVal, maxInc, maxVal) ];
					}
					case 'score': return [ ...Fn.map(set.entries(min as number, max as number), entry => entry[1]) ];
					default: {
						const convert = (value: number) => {
							if (value === Infinity || value === -Infinity) {
								throw new Error(`Invalid range value: ${value}`);
							} else if (value < 0) {
								return set.size + value;
							} else {
								return value;
							}
						};
						return set.values().slice(convert(min as number), convert(max as number) + 1);
					}
				}
			}();
			if (options?.limit) {
				return allMatching.slice(options.limit[0], options.limit[0] + options.limit[1]);
			} else {
				return allMatching;
			}
		} else {
			return [];
		}
	}

	zrangeStore(into: string, from: string, min: number | string, max: number | string, options?: P.ZRange) {
		const set: SortedSet | undefined = this.data.get(from);
		if (set) {
			const range: string[] = this.zrange(from, min, max, options);
			const out = new SortedSet;
			out.insert(Fn.map(range, member => [ set.score(member)!, member ]));
			if (out.size === 0) {
				this.data.delete(into);
			} else {
				this.data.set(into, out);
			}
			return out.size;
		} else {
			return 0;
		}
	}

	zrangeWithScores(key: string, min: number, max: number, options?: P.ZRange) {
		const set: SortedSet | undefined = this.data.get(key);
		if (set) {
			switch (options?.by) {
				case 'lex': throw new Error('Invalid request');
				case 'score': return [ ...set.entries(min, max) ];
				default: return [ ...Fn.map(set.values(), (value): [ number, string ] => [ set.score(value)!, value ]) ];
			}
		} else {
			return [];
		}
	}

	zrem(key: string, members: string[]) {
		const set: SortedSet | undefined = this.data.get(key);
		if (set) {
			const result = Fn.accumulate(members, member => set.delete(member));
			if (set.size === 0) {
				this.data.delete(key);
			}
			return result;
		} else {
			return 0;
		}
	}

	zremRange(key: string, min: number, max: number) {
		const set: SortedSet | undefined = this.data.get(key);
		if (set) {
			const result = Fn.accumulate(
				// Results are materialized into array upfront because `delete` invalidates `entries`
				[ ...Fn.map(set.entries(min, max), entry => entry[1]) ],
				member => set.delete(member));
			if (set.size === 0) {
				this.data.delete(key);
			}
			return result;
		} else {
			return 0;
		}
	}

	zscore(key: string, member: string) {
		const set: SortedSet | undefined = this.data.get(key);
		if (set) {
			return set.score(member) ?? null;
		} else {
			return null;
		}
	}

	zunionStore(key: string, keys: string[], options?: P.ZAggregate) {
		const out = new SortedSet;
		if (options?.weights) {
			// With WEIGHTS each set needs to be applied one at a time
			const maybeSets = Fn.map(keys.entries(), ([ index, key ]): [number, SortedSet] =>
				[ options.weights![index] ?? 1, this.data.get(key) ]);
			const sets = Fn.filter(maybeSets, entry => entry[1]);
			for (const [ weight, set ] of sets) {
				out.insert(set.entries(), (left, right) => left + right * weight);
			}
		} else {
			// Without WEIGHTS insert can happen at once
			const sets = [ ...Fn.filter(Fn.map(keys, (key): SortedSet => this.data.get(key))) ];
			out.insert(Fn.concat(Fn.map(sets, set => set.entries())));
		}
		if (out.size === 0) {
			this.data.delete(key);
		} else {
			this.data.set(key, out);
		}
		return out.size;
	}

	eval(script: KeyvalScript, keys: string[], argv: P.Value[]) {
		return this.evaluateInline(script.local, keys, argv);
	}

	load() {}

	async evaluateInline(script: string, keys: string[], argv: P.Value[]) {
		const fn = getOrSet(this.scripts, script, () => {
			// eslint-disable-next-line @typescript-eslint/no-implied-eval
			const impl = new Function(`return ${script}`)();
			return (instance, keys: string[], argv: P.Value[]) => impl(instance, keys, argv);
		});
		return fn(this, keys, argv);
	}

	async flushdb() {
		await this.blob.flushdb();
		this.data.clear();
	}

	async save() {
		if (this.url) {
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
				} else if (ArrayBuffer.isView(value)) {
					return { '#': 'uint8', $: typedArrayToString(value as Uint8Array) };
				} else {
					return value;
				}
			});
			const original = new URL(this.url);
			const tmp = new URL(`./.${original.pathname.substr(original.pathname.lastIndexOf('/') + 1)}.swp`, original);
			await Promise.all([
				this.blob.save(),
				async function() {
					await fs.writeFile(tmp, payload, 'utf8');
					await fs.rename(tmp, original);
				}(),
			]);
		}
	}

	private remove(key: string) {
		this.data.delete(key);
		this.expires.delete(key);
	}
}

class LocalKeyValClient extends makeClient(LocalKeyValResponder) {
	declare get: (...args: any[]) => any;
	declare req: (...args: any[]) => any;

	// https://github.com/microsoft/TypeScript/issues/27689
	// @ts-expect-error
	eval(script: KeyvalScript, keys: string[], argv: P.Value[]) {
		return this.evaluateInline(script.local, keys, argv);
	}
}

class LocalKeyValHost extends makeHost(LocalKeyValResponder) {
	declare get: (...args: any[]) => any;
	declare req: (...args: any[]) => any;
}
