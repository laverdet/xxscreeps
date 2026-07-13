import type { MaybePromises } from './responder.js';
import type * as Pr from 'xxscreeps/engine/db/storage/provider.js';
import type { KeyvalScript } from 'xxscreeps/engine/db/storage/script.js';
import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import { registerStorageProvider } from 'xxscreeps/engine/db/storage/register.js';
import { mappedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { latin1ToBuffer, typedArrayToString } from 'xxscreeps/utility/string.js';
import { AsyncDisposableResource, getOrSet } from 'xxscreeps/utility/utility.js';
import { BlobStorage } from './blob.js';
import { connect, makeClient, makeHost } from './responder.js';
import { SortedSet } from './sorted-set.js';

registerStorageProvider([ 'file', 'local' ], 'keyval', url => {
	const create = () => LocalKeyValResponder.create(url);
	return connect(url, LocalKeyValClient, LocalKeyValHost, create);
});

type PrimitiveValue = string | number;
type InternalMapValue = PrimitiveValue | Readonly<Uint8Array>;
type InternalValue = InternalMapValue | string[] | Map<string, InternalMapValue> | Set<string> | SortedSet;
type SerializedValue = PrimitiveValue | string[] | SerializedObject | SerializedMap | SerializedSet | SerializedSortedSet | SerializedUint8;
interface SerializedObject {
	[key: string]: unknown;
	'#'?: never;
}
type LocalKeyValScript = (keyval: LocalKeyValResponder, keys: string[], argv: unknown[]) => unknown;

interface SerializedMap {
	readonly '#': 'map';
	readonly $: Record<string, unknown>;
}

interface SerializedSet {
	readonly '#': 'set';
	readonly $: string[];
}

interface SerializedSortedSet {
	readonly '#': 'zset';
	readonly $: [ number, string ][];
}

interface SerializedUint8 {
	readonly '#': 'uint8';
	readonly $: string;
}

export class LocalKeyValResponder extends AsyncDisposableResource implements MaybePromises<Pr.KeyValProvider> {
	readonly blob;
	private readonly data = new Map<string, InternalValue>();
	private readonly expires = new Set<string>();
	private readonly scripts = new Map<string, (instance: LocalKeyValResponder, keys: string[], argv: Pr.Value[]) => unknown>();
	private readonly url;
	private saveWait: Promise<void> | undefined;

	private constructor(
		disposable: AsyncDisposableStack,
		url: URL | undefined,
		blob: BlobStorage,
		payload: string | undefined,
	) {
		super(disposable);
		this.url = url;
		this.blob = blob;
		if (payload !== undefined) {
			const map = JSON.parse(payload, (key, value: SerializedValue) => {
				if (typeof value !== 'object' || value instanceof Array) {
					return value;
				} else {
					switch (value['#']) {
						case 'map': return new Map(Object.entries(value.$));
						case 'set': return new Set(value.$);
						case 'zset': return new SortedSet(value.$);
						case 'uint8': return latin1ToBuffer(value.$);
						case undefined: return value;
					}
				}
			}) as InternalValue;
			if (map instanceof Map) {
				this.data = map;
			}
		}
	}

	static async create(pathArg: URL) {
		// Copy URL, ensure it ends with '/', and strip query parameters
		let path = new URL(pathArg);
		assert.ok(!path.pathname.endsWith('/'));
		path.pathname += '/';
		path = new URL('./', path);

		// Instantiate blob storage, also acquires lock
		await using disposable = new AsyncDisposableStack();
		const blob = disposable.use(await BlobStorage.create(path));

		// Load saved payload
		const [ url, payload ] = await async function() {
			if (path.protocol === 'file:') {
				const url = new URL('data.json', path);
				const payload = await async function() {
					try {
						return await fs.readFile(new URL('data.json', path), 'utf8');
					} catch {}
				}();
				return [ url, payload ] as const;
			}
			return [];
		}();

		// Move disposable into host
		return new LocalKeyValResponder(disposable.move(), url, blob, payload);
	}

	copy(from: string, to: string, options?: Pr.Copy) {
		const value = this.data.get(from);
		if (value === undefined) {
			return this.blob.copy(from, to, options);
		} else if (options?.if === 'NX' && this.data.has(to)) {
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
			return this.blob.del(key) satisfies Promise<boolean> as unknown as boolean;
		}
	}

	delEx(key: string, options: Pr.DelEx) {
		if (this.data.get(key) === options.eq) {
			this.remove(key);
			return true;
		} else {
			return false;
		}
	}

	mDel(...keys: string[]) {
		return Fn.pipe(
			keys,
			$$ => Fn.filter($$, key => this.data.has(key)),
			// eslint-disable-next-line no-sequences
			$$ => Fn.map($$, key => (this.remove(key), 1)),
			$$ => Fn.accumulate($$));
	}

	vDel(key: string) {
		this.del(key);
	}

	get(key: string, options: Pr.AsBlob): Promise<Readonly<Uint8Array> | null>;
	get(key: string, options?: Pr.AsString): string | null;
	get(key: string, options?: Pr.Get) {
		if (options?.blob) {
			return this.blob.get(key);
		} else {
			const value = this.lookupPrimitive(key);
			return value === undefined ? null : String(value);
		}
	}

	pTTL(key: string) {
		if (this.expires.has(key)) {
			// they don't actually have a ttl, it will expire on restart
			return 99_000;
		} else if (this.data.has(key)) {
			return -1;
		} else {
			return -2;
		}
	}

	req(key: string, options: Pr.AsBlob): Promise<Readonly<Uint8Array>>;
	req(key: string, options?: Pr.AsString): string;
	req(key: string, options?: Pr.Get) {
		if (options?.blob) {
			return this.blob.req(key);
		} else {
			const value = this.get(key);
			if (value === null) {
				throw new Error(`"${key}" does not exist`);
			}
			return value;
		}
	}

	set(key: string, value: Pr.Value, options: Pr.SetGet): string | null;
	set(key: string, value: Pr.Value, options: Pr.SetIf): false | undefined;
	set(key: string, value: Pr.Value, options?: Pr.Set): undefined;
	set(key: string, value: Pr.Value, options?: Pr.Set) {
		if (ArrayBuffer.isView(value)) {
			return this.blob.set(key, value, options);
		}
		if (options?.if) {
			switch (options.if.if) {
				case 'EQ': if (this.data.get(key) !== options.if.value) return false; break;
				case 'NE': if (this.data.get(key) === options.if.value) return false; break;
				case 'NX': if (this.data.has(key)) return false; break;
				case 'XX': if (!this.data.has(key)) return false; break;
			}
		}
		if (options?.px !== undefined) {
			this.expires.add(key);
		}
		if (options?.get) {
			const current = this.lookupPrimitive(key);
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
			const value = this.lookupPrimitive(key);
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

	hDel(key: string, fields: string[]) {
		const map = this.lookupObject(key, Map);
		if (map) {
			const removed = Fn.accumulate(fields, field => map.delete(field) ? 1 : 0);
			if (map.size === 0) {
				this.remove(key);
			}
			return removed;
		} else {
			return 0;
		}
	}

	hGet(key: string, field: string) {
		const value = this.lookupObject(key, Map)?.get(field);
		return value === undefined ? null : String(value);
	}

	hGetAll(key: string) {
		const map = this.lookupObject(key, Map);
		return Fn.pipe(
			map ?? [],
			$$ => Fn.map($$, ([ key, value ]) => [ key, String(value) ] as const),
			$$ => Fn.fromEntries($$));
	}

	hincrBy(key: string, field: string, value: number) {
		const map = this.lookupOrSetObject(key, Map);
		const result = (Number(map.get(field)) || 0) + value;
		map.set(field, result);
		return result;
	}

	hmGet(key: string, fields: string[], options: Pr.AsBlob): Record<string, Readonly<Uint8Array> | null>;
	hmGet(key: string, fields: string[], options?: Pr.AsString): Record<string, string | null>;
	hmGet(key: string, fields: string[], options?: Pr.Get): Record<string, unknown> {
		const map = this.lookupObject(key, Map);
		const to: (value: InternalMapValue | undefined) => unknown = function() {
			if (options?.blob) {
				// nb: We assume blobs were placed as blobs.
				return value => value ?? null;
			} else {
				return value => value === undefined ? null : String(value);
			}
		}();
		return Fn.pipe(
			fields,
			$$ => Fn.map($$, field => [ field, to(map?.get(field)) ] as const),
			$$ => Fn.fromEntries($$));
	}

	hSet(key: string, field: string, value: Pr.Value, options?: Pr.HSet) {
		const map = this.lookupOrSetObject(key, Map);
		const has = map.has(field);
		if (options?.if === 'NX' && has) {
			return false;
		} else {
			map.set(field, value);
			return !has;
		}
	}

	hmSet(key: string, fields: [ string, Pr.Value ][] | Record<string, Pr.Value>) {
		const map = this.lookupOrSetObject(key, Map);
		const iterable = function() {
			if (fields instanceof Array) {
				return fields;
			} else {
				return Object.entries(fields);
			}
		}();
		for (const [ field, value ] of iterable) {
			map.set(field, value);
		}
	}

	lPop(key: string) {
		const list = this.lookupObject(key, Array);
		if (!list) {
			return null;
		} else if (list.length === 1) {
			this.remove(key);
			return list[0]!;
		} else {
			return list.shift()!;
		}
	}

	lRange(key: string, start: number, stop: number) {
		const list = this.lookupObject(key, Array);
		if (list) {
			return list.slice(
				start >= 0 ? start : Math.max(0, list.length + start),
				stop >= 0 ? stop + 1 : Math.max(0, list.length + stop + 1),
			);
		} else {
			return [];
		}
	}

	rPush(key: string, elements: string[]) {
		const list = this.lookupObject(key, Array);
		const strings = Fn.map(elements, String);
		if (list) {
			list.push(...strings);
			return list.length;
		} else {
			this.data.set(key, [ ...strings ]);
			return elements.length;
		}
	}

	sAdd(key: string, members: string[]) {
		const set = this.lookupObject(key, Set);
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

	sCard(key: string) {
		return this.lookupObject(key, Set)?.size ?? 0;
	}

	sDiff(key: string, keys: string[]) {
		const set = this.lookupObject(key, Set);
		if (set) {
			const sets = Fn.pipe(
				keys,
				$$ => Fn.map($$, key => this.lookupObject(key, Set)),
				$$ => Fn.filter($$),
				$$ => [ ...$$ ]);
			if (sets.length === 0) {
				return [ ...set ];
			} else {
				return [ ...Fn.reject(set, member => sets.some(set => set.has(member))) ];
			}
		} else {
			return [];
		}
	}

	sInter(key: string, keys: string[]) {
		const sets = Fn.pipe(
			Fn.concat<string>([ [ key ], keys ]),
			$$ => Fn.map($$, key => this.lookupObject(key, Set)),
			$$ => [ ...$$ ]);
		if (sets.every(set => set !== undefined)) {
			sets.sort(mappedNumericComparator(set => set.size));
			const first = sets.shift()!;
			return [ ...Fn.filter(first, member => sets.every(set => set.has(member))) ];
		} else {
			return [];
		}
	}

	sIsMember(key: string, member: string) {
		return this.lookupObject(key, Set)?.has(member) ?? false;
	}

	smIsMember(key: string, members: string[]) {
		const set = this.lookupObject(key, Set);
		if (set) {
			return members.map(member => set.has(member));
		} else {
			return members.map(() => false);
		}
	}

	sMembers(key: string) {
		const set = this.lookupObject(key, Set);
		return set ? [ ...set ] : [];
	}

	sPop(key: string) {
		const set = this.lookupObject(key, Set);
		if (set) {
			const value = Fn.first(set)!;
			if (set.size === 1) {
				this.remove(key);
			} else {
				set.delete(value);
			}
			return value;
		} else {
			return null;
		}
	}

	sRem(key: string, members: string[]) {
		const set = this.lookupObject(key, Set);
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

	sUnionStore(key: string, keys: string[]) {
		const out = Fn.pipe(
			keys,
			$$ => Fn.map($$, key => this.lookupObject(key, Set)),
			$$ => Fn.filter($$),
			$$ => Fn.concat($$),
			$$ => new Set($$));
		if (out.size === 0) {
			this.data.delete(key);
		} else {
			this.data.set(key, out);
		}
		return out.size;
	}

	zAdd(key: string, members: [ number, string ][], options?: Pr.ZAdd): any {
		const set = this.lookupOrSetObject(key, SortedSet);
		try {
			const range = function() {
				switch (options?.if) {
					case 'NX': return Fn.reject(members, member => set.has(member[1]));
					case 'XX': return Fn.filter(members, member => set.has(member[1]));
					case undefined:
					default: return members;
				}
			}();
			const up = function(): (left: number | undefined, right: number) => number {
				switch (options?.up) {
					case 'GT': return (left, right) => left === undefined ? right : Math.max(left, right);
					case 'LT': return (left, right) => left === undefined ? right : Math.min(left, right);
					case undefined:
					default: return (left, right) => right;
				}
			}();

			if (options?.incr) {
				if (members.length > 1) {
					throw new Error('ZADD with INCR option cannot be used with multiple elements');
				}
				using shift = Fn.shift(range);
				const { head } = shift;
				if (head) {
					const score = set.score(head[1]);
					if (score === undefined) {
						return null;
					} else {
						const result = score + head[0];
						set.add(head[1], result);
						return result;
					}
				} else {
					return null;
				}
			} else {
				return set.insert(range, up);
			}
		} finally {
			if (set.size === 0) {
				this.data.delete(key);
			}
		}
	}

	zCard(key: string) {
		return this.lookupObject(key, SortedSet)?.size ?? 0;
	}

	zIncrBy(key: string, delta: number, member: string) {
		const set = this.lookupOrSetObject(key, SortedSet);
		const score = (set.score(member) ?? 0) + delta;
		set.add(member, score);
		return score;
	}

	zInterStore(key: string, keys: string[], options?: Pr.ZAggregate) {
		// Fetch sets first because you can use this command to store a set back into itself
		const sets = [ ...Fn.map(keys, key => this.lookupObject(key, SortedSet)) ];
		const out = function() {
			if (sets.every(set => set !== undefined)) {
				const smallest = Fn.minimum(sets, mappedNumericComparator(set => set.size));
				if (smallest) {
					// Generate intersection
					const weights = options?.weights ?? [ ...Fn.map(sets, () => 1) ];
					return new SortedSet(function*(): Iterable<[ number, string ]> {
						loop: for (const member of smallest.values()) {
							let nextScore = 0;
							for (const [ ii, set ] of sets.entries()) {
								const score = set.score(member);
								if (score === undefined) {
									continue loop;
								}
								nextScore += score * weights[ii]!;
							}
							yield [ nextScore, member ];
						}
					}());
				}
			}
		}();
		if (out && out.size > 0) {
			this.data.set(key, out);
			return out.size;
		} else {
			this.remove(key);
			return 0;
		}
	}

	zmScore(key: string, members: string[]) {
		const set = this.lookupObject(key, SortedSet);
		if (set) {
			return members.map(member => set.score(member) ?? null);
		} else {
			return members.map(() => null);
		}
	}

	zRange(key: string, min: number | string, max: number | string, options?: Pr.ZRange) {
		const set = this.lookupObject(key, SortedSet);
		if (set) {
			const allMatching = function() {
				switch (options?.by) {
					case 'LEX': {
						const parse = (value: string): [ string, boolean ] => {
							if (value === '-') {
								return [ '', true ];
							} else if (value === '+') {
								return [ '\uffff', true ];
							} else if (value.startsWith('(')) {
								return [ value.slice(1), false ];
							} else if (value.startsWith('[')) {
								return [ value.slice(1), true ];
							} else {
								throw new Error(`Invalid range: ${value}`);
							}
						};
						const [ minVal, minInc ] = parse(min satisfies number | string as string);
						const [ maxVal, maxInc ] = parse(max satisfies number | string as string);
						return set.entriesByLex(minInc, minVal, maxInc, maxVal);
					}
					case 'SCORE': {
						const entries = set.entries(
							min satisfies number | string as number,
							max satisfies number | string as number);
						return Fn.map(entries, entry => entry[1]);
					}
					case undefined:
					default: {
						const convert = (value: number) => {
							if (value < 0) {
								return set.size + value;
							} else {
								return value;
							}
						};
						const from = convert(min satisfies number | string as number);
						const to = convert(max satisfies number | string as number) + 1;
						return Fn.slice(set.values(), from, to);
					}
				}
			}();
			return [ ...function*() {
				if (options?.limit) {
					const [ from, to ] = options.limit;
					let ii = 0;
					for (const member of allMatching) {
						if (ii++ >= from) {
							if (ii > to) {
								break;
							} else {
								yield member;
							}
						}
					}
				} else {
					yield* allMatching;
				}
			}() ];
		} else {
			return [];
		}
	}

	zRangeStore(into: string, from: string, min: number | string, max: number | string, options?: Pr.ZRange) {
		const set = this.lookupObject(from, SortedSet);
		if (set) {
			const range = this.zRange(from, min, max, options);
			const out = new SortedSet();
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

	zRangeWithScores(key: string, min: number, max: number, options?: Pr.ZRange) {
		const set = this.lookupObject(key, SortedSet);
		if (set) {
			switch (options?.by) {
				case 'LEX': throw new Error('Invalid request');
				case 'SCORE': return [ ...set.entries(min, max) ];
				case undefined:
				default: {
					const values = this.zRange(key, min, max, options);
					return values.map((value): [ number, string ] => [ set.score(value)!, value ]);
				}
			}
		} else {
			return [];
		}
	}

	zRem(key: string, members: string[]) {
		const set = this.lookupObject(key, SortedSet);
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

	zRemRange(key: string, min: number, max: number) {
		const set = this.lookupObject(key, SortedSet);
		if (set) {
			// Results are materialized into array upfront because `delete` invalidates `entries`
			const members = [ ...Fn.map(set.entries(min, max), entry => entry[1]) ];
			const result = Fn.accumulate(members, member => set.delete(member));
			if (set.size === 0) {
				this.data.delete(key);
			}
			return result;
		} else {
			return 0;
		}
	}

	zScore(key: string, member: string) {
		return this.lookupObject(key, SortedSet)?.score(member) ?? null;
	}

	zUnionStore(key: string, keys: string[], options?: Pr.ZAggregate) {
		const out = new SortedSet((() => {
			if (options?.weights) {
				// With WEIGHTS each set needs to be applied one at a time
				const { weights } = options;
				return Fn.pipe(
					keys.entries(),
					$$ => Fn.map($$, ([ index, key ]) =>
						[ weights[index] ?? 1, this.lookupObject(key, SortedSet) ] as const),
					$$ => Fn.filter($$, (entry): entry is [ number, SortedSet ] => Boolean(entry[1])),
					$$ => Fn.transform($$, ([ weight, set ]) =>
						Fn.map(set.entries(), ([ score, member ]) => [ score * weight, member ] as const)));
			} else {
				// Without WEIGHTS insert can happen at once
				return Fn.pipe(
					keys,
					$$ => Fn.map($$, key => this.lookupObject(key, SortedSet)),
					$$ => Fn.filter($$),
					$$ => [ ...$$ ],
					$$ => Fn.transform($$, set => set.entries()));
			}
		})());
		if (out.size === 0) {
			this.data.delete(key);
		} else {
			this.data.set(key, out);
		}
		return out.size;
	}

	eval(script: KeyvalScript, keys: string[], argv: Pr.Value[]) {
		return this._evaluateInline(script.local, keys, argv) as Pr.Value | Pr.Value[] | null;
	}

	load() {}

	async flushdb() {
		await this.blob.flushdb();
		this.data.clear();
	}

	async save() {
		if (this.url) {
			// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
			const { promise, resolve } = Promise.withResolvers<void>();
			const { saveWait } = this;
			this.saveWait = promise;
			try {
				await saveWait;
				const payload = JSON.stringify(this.data, (key, value: InternalValue): SerializedValue => {
					if (value === this.data) {
						return {
							'#': 'map',
							$: Fn.fromEntries(Fn.reject(this.data.entries(), entry => this.expires.has(entry[0]))),
						};
					} else if (value instanceof Map) {
						return { '#': 'map', $: Fn.fromEntries(value.entries()) };
					} else if (value instanceof Set) {
						return { '#': 'set', $: [ ...value ] };
					} else if (value instanceof SortedSet) {
						return { '#': 'zset', $: [ ...value.entries() ] };
					} else if (ArrayBuffer.isView(value)) {
						return { '#': 'uint8', $: typedArrayToString(value) };
					} else {
						return value;
					}
				});
				const original = new URL(this.url);
				const tmp = new URL(`./.${original.pathname.slice(original.pathname.lastIndexOf('/') + 1)}.swp`, original);
				await Promise.all([
					this.blob.save(),
					async function() {
						await fs.writeFile(tmp, payload, 'utf8');
						await fs.rename(tmp, original);
					}(),
				]);
			} finally {
				resolve();
			}
		}
	}

	_evaluateInline(script: string, keys: string[], argv: Pr.Value[]) {
		const fn = getOrSet(this.scripts, script, () => {
			// eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
			const make = new Function(`return ${script}`) as () => LocalKeyValScript;
			return make();
		});
		return fn(this, keys, argv);
	}

	private lookupObject<Type>(key: string, constructor: abstract new(...args: any[]) => Type): Extract<InternalValue, Type> | undefined {
		const value = this.data.get(key);
		if (value !== undefined) {
			if (value instanceof constructor) {
				return value satisfies Type as Extract<InternalValue, Type>;
			} else {
				throw new Error(`'${key}' is not a primitive`);
			}
		}
	}

	private lookupOrSetObject<Type>(key: string, constructor: new() => Type): Extract<InternalValue, Type> {
		const value = this.data.get(key);
		if (value === undefined) {
			const newValue = new constructor() satisfies Type as Extract<InternalValue, Type>;
			this.data.set(key, newValue);
			return newValue;
		} else if (value instanceof constructor) {
			return value satisfies Type as Extract<InternalValue, Type>;
		} else {
			throw new Error(`'${key}' is not a primitive`);
		}
	}

	private lookupPrimitive(key: string) {
		const value = this.data.get(key);
		if (value !== undefined) {
			if (typeof value === 'object') {
				throw new Error(`'${key}' is not a primitive`);
			} else {
				return value;
			}
		}
	}

	private remove(key: string) {
		this.data.delete(key);
		this.expires.delete(key);
	}
}

class LocalKeyValClient extends makeClient(LocalKeyValResponder) {
	// These correspond to the overloaded functions in `LocalKeyValResponder` which cannot be mapped
	// via `MaybePromises`.
	declare get: (...args: unknown[]) => any;
	declare hmGet: (...args: unknown[]) => any;
	declare req: (...args: unknown[]) => any;
	declare set: (...args: unknown[]) => any;

	// https://github.com/microsoft/TypeScript/issues/27689
	// @ts-expect-error
	eval(script: KeyvalScript, keys: string[], argv: Pr.Value[]): any {
		return this._evaluateInline(script.local, keys, argv);
	}
}

class LocalKeyValHost extends makeHost(LocalKeyValResponder) {
	declare eval: (...args: unknown[]) => any;
	declare get: (...args: unknown[]) => any;
	declare hmGet: (...args: unknown[]) => any;
	declare req: (...args: unknown[]) => any;
	declare set: (...args: unknown[]) => any;
}
