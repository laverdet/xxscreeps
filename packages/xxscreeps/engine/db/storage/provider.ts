/* eslint-disable @typescript-eslint/method-signature-style */
import type { KeyvalScript } from './script.js';
import type { Effect } from 'xxscreeps/utility/types.js';

export type { KeyvalScript };

export interface AsBlob { blob?: boolean }
export interface Copy { if?: 'NX' }
export type Condition = ConditionEqual | ConditionNotEqual | ConditionExists | ConditionNotExists;
export interface ConditionEqual { if: 'EQ'; value: string | Readonly<Uint8Array> }
export interface ConditionNotEqual { if: 'NE'; value: string | Readonly<Uint8Array> }
export interface ConditionNotExists { if: 'NX' }
export interface ConditionExists { if: 'XX' }
export interface DelEx {
	eq: string;
}
export interface Set {
	if?: Condition;
	get?: boolean;
	px?: number;
	// Flag which announces that the client will retain and modify the buffer after invocation. A
	// network provider would be able to simply write the buffer to the wire, but the default local
	// provider needs to make a copy.
	retain?: boolean;
}
export interface HSet {
	if?: 'NX';
}
export interface ZAdd {
	if?: 'NX' | 'XX';
	up?: 'GT' | 'LT';
	incr?: boolean;
}
export interface ZAggregate {
	// aggregate: 'sum' | 'min' | 'max';
	weights?: number[];
}
export interface ZRange {
	by?: 'LEX' | 'SCORE';
	limit?: [ number, number ];
	rev?: boolean;
}

export type Value = number | string | Readonly<Uint8Array>;
export interface KeyValProvider {
	// keys / strings
	copy(from: string, to: string, options?: Copy): Promise<boolean>;
	del(key: string): Promise<boolean>;
	delEx(key: string, options: DelEx): Promise<boolean>;
	pTTL(key: string): Promise<number>;
	mdel(...keys: string[]): Promise<number>;
	// 'vdel' returns no response and may be reordered in relation to other commands
	// it used to coalesce multiple same-tick invocations into the same del redis command. i'm not
	// sure if that's still plausible or even worthwhile but there it is.
	vdel(key: string): Promise<void>;
	get(key: string, options: { blob: true }): Promise<Readonly<Uint8Array> | null>;
	get(key: string, options?: AsBlob): Promise<string | null>;
	req(key: string, options: { blob: true }): Promise<Readonly<Uint8Array>>;
	req(key: string, options?: AsBlob): Promise<string>;
	set(key: string, value: Value, options: { get: true } & Set): Promise<string | null>;
	set(key: string, value: Value, options: { if: Condition; get?: undefined } & Set): Promise<false | undefined>;
	set(key: string, value: Value, options?: Set): Promise<undefined>;

	// numbers
	decr(key: string): Promise<number>;
	decrBy(key: string, value: number): Promise<number>;
	incr(key: string): Promise<number>;
	incrBy(key: string, value: number): Promise<number>;

	// hashes
	hDel(key: string, fields: string[]): Promise<number>;
	hGet(key: string, field: string): Promise<string | null>;
	hGetAll(key: string): Promise<Record<string, string>>;
	hincrBy(key: string, field: string, value: number): Promise<number>;
	hmGet(key: string, fields: string[], options: { blob: true }): Promise<Record<string, Readonly<Uint8Array> | null>>;
	hmGet(key: string, fields: string[], options?: AsBlob): Promise<Record<string, string | null>>;
	hSet(key: string, field: string, value: Value, options?: HSet): Promise<boolean>;
	hmset(key: string, fields: [ string, Value ][] | Record<string, Value>): Promise<void>;

	// lists
	lPop(key: string): Promise<string | null>;
	lRange(key: string, start: number, stop: number): Promise<string[]>;
	rPush(key: string, elements: Value[]): Promise<number>;

	// sets
	sAdd(key: string, members: string[]): Promise<number>;
	sCard(key: string): Promise<number>;
	sDiff(key: string, keys: string[]): Promise<string[]>;
	sInter(key: string, keys: string[]): Promise<string[]>;
	sIsMember(key: string, member: string): Promise<boolean>;
	smIsMember(key: string, members: string[]): Promise<boolean[]>;
	sMembers(key: string): Promise<string[]>;
	sPop(key: string): Promise<string | null>;
	sRem(key: string, members: string[]): Promise<number>;
	sUnionStore(key: string, keys: string[]): Promise<number>;

	// sorted sets
	zAdd(key: string, members: [ number, string ][], options: { incr: true } & ZAdd): Promise<number | null>;
	zAdd(key: string, members: [ number, string ][], options?: ZAdd): Promise<number>;
	zCard(key: string): Promise<number>;
	zIncrBy(key: string, delta: number, member: string): Promise<number>;
	zInterStore(key: string, keys: string[], options?: ZAggregate): Promise<number>;
	zmScore(key: string, members: string[]): Promise<(number | null)[]>;
	zRange(key: string, min: string, max: string, options: ZRange & { by: 'LEX' }): Promise<string[]>;
	zRange(key: string, min: number, max: number, options?: ZRange): Promise<string[]>;
	zRangeStore(into: string, from: string, min: number, max: number, options?: ZRange): Promise<number>;
	zRangeWithScores(key: string, min: number, max: number, options?: ZRange): Promise<[ number, string ][]>;
	zRem(key: string, members: string[]): Promise<number>;
	zRemRange(key: string, min: number, max: number): Promise<number>;
	zScore(key: string, member: string): Promise<number | null>;
	zUnionStore(key: string, keys: string[], options?: ZAggregate): Promise<number>;

	// scripting
	eval<Result extends Value[] | Value | null, Keys extends string[], Argv extends Value[]>(script: KeyvalScript<Result, Keys, Argv>, keys: Keys, argv: Argv): Promise<Result>;
	load(script: KeyvalScript): Promise<void>;

	// management
	flushdb(): Promise<void>;
	save(): Promise<void>;
}

export interface PubSubProvider extends AsyncDisposable {
	// pub/sub
	publish(key: string, message: string): Promise<void>;
	subscribe(key: string, listener: PubSubListener): Promise<readonly [ Effect, PubSubSubscription ]>;
}

export type PubSubListener = (message: string) => void;

export interface PubSubSubscription {
	// publishing from a subscription will not send that message to your listener
	publish(message: string): Promise<void>;
}
