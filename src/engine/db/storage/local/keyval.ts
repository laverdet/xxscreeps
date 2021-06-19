/* eslint-disable @typescript-eslint/require-await */
import type * as Provider from 'xxscreeps/engine/db/storage/provider';
import type { KeyvalScript } from 'xxscreeps/engine/db/storage/script';
import type { MaybePromises } from './responder';
import fs from 'fs/promises';
import * as Fn from 'xxscreeps/utility/functional';
import { latin1ToBuffer, typedArrayToString } from 'xxscreeps/utility/string';
import { Responder, connect, makeClient, makeHost } from './responder';
import { SortedSet } from './sorted-set';
import { registerStorageProvider } from 'xxscreeps/engine/db/storage';
import { getOrSet } from 'xxscreeps/utility/utility';

registerStorageProvider([ 'file', 'local' ], 'keyval', url =>
	connect(`${url}`, LocalKeyValClient, LocalKeyValHost, async() => {
		const payload = await async function() {
			if (url.protocol === 'file:') {
				try {
					return await fs.readFile(url, 'utf8');
				} catch {}
			}
		}();
		return new LocalKeyValResponder(`${url}`, payload);
	}));

type Value = Provider.Value;

export class LocalKeyValResponder extends Responder implements MaybePromises<Provider.KeyValProvider> {
	private readonly data = new Map<string, any>();
	private readonly expires = new Set<string>();
	private readonly scripts = new Map<string, (instance: LocalKeyValResponder, keys: string[], argv: Value[]) => any>();

	constructor(private readonly url: string, payload?: string) {
		super();
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

	cad(key: string, check: string) {
		if (this.data.get(key) === check) {
			this.remove(key);
			return true;
		} else {
			return false;
		}
	}

	cas(key: string, expected: Value, desired: Value) {
		const current = this.data.get(key);
		if (`${current}` === `${expected}`) {
			this.data.set(key, desired);
			return true;
		} else {
			return false;
		}
	}

	copy(from: string, to: string, options?: Provider.Copy) {
		const value = this.data.get(from);
		if (value === undefined) {
			return false;
		} else if (options?.if === 'nx' && this.data.has(to)) {
			return false;
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
		return true;
	}

	del(key: string) {
		if (this.data.has(key)) {
			this.remove(key);
			return true;
		} else {
			return false;
		}
	}

	get(key: string) {
		const value = this.data.get(key);
		return value === undefined ? null : String(value);
	}

	set(key: string, value: Value | Readonly<Uint8Array>, options?: Provider.Set): any {
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
		const map: Map<string, string> | undefined = this.data.get(key);
		return Fn.fromEntries(Fn.map(fields, field => [ field, map?.get(field) ?? null ]));
	}

	hset(key: string, field: string, value: Value, options?: Provider.HSet) {
		const map: Map<string, any> = getOrSet(this.data, key, () => new Map);
		const has = map.has(field);
		if (options?.if === 'nx' && has) {
			return false;
		} else {
			map.set(field, value);
			return !has;
		}
	}

	hmset(key: string, fields: Iterable<readonly [ string, Value ]> | Record<string, Value>) {
		const map: Map<string, any> = getOrSet(this.data, key, () => new Map);
		const iterable = Symbol.iterator in fields ?
			fields as Iterable<[ string, Value ]> :
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

	rpush(key: string, elements: Value[]) {
		const list: string[] | undefined = this.data.get(key);
		const strings = Fn.map(elements, element => `${element}`);
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
		} else {
			this.data.set(key, new Set(members));
			return members.length;
		}
	}

	scard(key: string) {
		const set: Set<string> | undefined = this.data.get(key);
		return set ? set.size : 0;
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

	smembers(key: string) {
		const set: Set<string> | undefined = this.data.get(key);
		return set ? [ ...set ] : [];
	}

	spop(key: string) {
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

	zadd(key: string, members: [ number, string ][], options?: Provider.ZAdd) {
		const set = getOrSet<string, SortedSet>(this.data, key, () => new SortedSet);
		switch (options?.if) {
			case 'nx': return set.insert(members, left => left);
			case 'xx': return set.insert(Fn.reject(members, member => set.has(member[1])), (left, right) => right);
			default: return set.insert(members, (left, right) => right);
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

	zmscore(key: string, members: string[]) {
		const set: SortedSet | undefined = this.data.get(key);
		if (set) {
			return members.map(member => set.score(member) ?? null);
		} else {
			return members.map(() => null);
		}
	}

	zrange(key: string, min: number | string, max: number | string, options?: Provider.ZRange): any {
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
					default: return set.values().slice(min as number, max as number);
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

	zrangeWithScores(key: string, min: number, max: number, options?: Provider.ZRange) {
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
			return Fn.accumulate(members, member => set.delete(member));
		} else {
			return 0;
		}
	}

	zremRange(key: string, min: number, max: number) {
		const set: SortedSet | undefined = this.data.get(key);
		if (set) {
			return Fn.accumulate(
				// Results are materialized into array upfront because `delete` invalidates `entries`
				[ ...Fn.map(set.entries(min, max), entry => entry[1]) ],
				member => set.delete(member));
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

	zunionStore(key: string, keys: string[]) {
		// Fetch sets first because you can use this command to store a set back into itself
		const sets = [ ...Fn.filter(Fn.map(keys, (key): SortedSet => this.data.get(key))) ];
		const out = new SortedSet;
		this.data.set(key, out);
		out.insert(Fn.concat(Fn.map(sets, set => set.entries())));
		return out.size;
	}

	eval(script: KeyvalScript, keys: string[], argv: Value[]) {
		return this.evaluateInline(script.id, script.local, keys, argv);
	}

	async evaluateInline(id: string, script: string, keys: string[], argv: Value[]) {
		const fn = getOrSet(this.scripts, id, () => {
			// eslint-disable-next-line @typescript-eslint/no-implied-eval
			const impl = new Function(`return ${script}`)();
			return (instance, keys: string[], argv: Value[]) => impl(instance, keys, argv);
		});
		return fn(this, keys, argv);
	}

	flushdb() {
		this.data.clear();
	}

	async save() {
		if (this.url.startsWith('file:')) {
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
			const original = new URL(this.url);
			const tmp = new URL(`./.${original.pathname.substr(original.pathname.lastIndexOf('/') + 1)}.swp`, original);
			await fs.writeFile(tmp, payload, 'utf8');
			await fs.rename(tmp, original);
		}
	}

	private remove(key: string) {
		this.data.delete(key);
		this.expires.delete(key);
	}
}

class LocalKeyValClient extends makeClient(LocalKeyValResponder) {
	// https://github.com/microsoft/TypeScript/issues/27689
	// @ts-expect-error
	eval(script: KeyvalScript, keys: string[], argv: Value[]) {
		return this.evaluateInline(script.id, script.local, keys, argv);
	}
}

class LocalKeyValHost extends makeHost(LocalKeyValResponder) {}
