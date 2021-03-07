import type { CounterExtract, Dictionary, Implementation, UnwrapArray } from 'xxscreeps/util/types';
import type { RoomObject } from 'xxscreeps/game/objects/room-object';
import { IntentIdentifier, PreTick, Processors, Tick } from './symbols';
export { registerRoomTickProcessor } from './room';

// `RoomObject` type definitions
type IntentProcessorHolder = Dictionary<(receiver: any, ...data: any) => void>;
type IntentIdentifierResult = { group: string; name: string };
type IntentReceiverInstance = {
	[IntentIdentifier]: IntentIdentifierResult;
	[Processors]?: IntentProcessorHolder;
};
type TickProcessor<Type = any> = (receiver: Type) => void;
declare module 'xxscreeps/game/room' {
	interface Room {
		[Processors]?: IntentProcessorHolder;
	}
}
declare module 'xxscreeps/game/objects/room-object' {
	interface RoomObject {
		[IntentIdentifier]: IntentIdentifierResult;
		[PreTick]?: TickProcessor;
		[Processors]?: IntentProcessorHolder;
		[Tick]?: TickProcessor;
	}
}

// `undefined` is not allowed in intent processors because it JSON serializes to `null`
type AllowedTypes = string | number | boolean | null | AllowedTypes[];
type NullToUndefined<Type> = Type extends null ? undefined | null : Type;
type RemapNull<Type> = Type extends any[] ? {
	[Key in keyof Type]: RemapNull<Type[Key]>;
} : NullToUndefined<Type>;

// Custom intents that the IntentManager will accept, but isn't handled by the normal processor pipeline
export type DescribeIntentHandler<Name extends string, Intent extends string, Fn extends (...data: any) => void> =
	Fn extends (...data: infer Data) => void ?
		Data extends AllowedTypes[] ? { type: Name; intent: Intent; data: RemapNull<Data> } : never : never;

// Register RoomObject intent processor
export function registerIntentProcessor<Type extends IntentReceiverInstance, Intent extends string, Data extends AllowedTypes[]>(
	receiver: Implementation<Type>,
	intent: Intent,
	process: (receiver: Type, ...data: Data) => void,
): void | { type: Type; intent: Intent; data: RemapNull<Data> } {
	const processors = receiver.prototype[Processors] = receiver.prototype[Processors] ?? {};
	processors[intent] = process;
}
export interface Intent {}

// Types for intent processors
type Intents = Exclude<UnwrapArray<Intent[keyof Intent]>, void>;
export type IntentReceivers = Intents['type'];
export type IntentsForReceiver<Type extends IntentReceivers> =
	CounterExtract<Intents, { type: Type; intent: any; data: any }>['intent'];
export type IntentParameters<Type extends IntentReceivers, Intent extends string> =
	CounterExtract<Intents, { type: Type; intent: Intent; data: any }>['data'];

type IntentsForHelper<Type extends IntentReceivers> =
	CounterExtract<Intents, { type: Type; intent: any; data: any }>;

export type IntentMapFor<Type extends IntentReceivers> = {
	[Key in IntentsForHelper<Type>['intent']]?: IntentParameters<Type, Key>;
};
export type IntentListFor<Type extends IntentReceivers> = {
	[Key in IntentsForHelper<Type>['intent']]?: IntentParameters<Type, Key>[];
};

// Register per-tick per-object processor
export function registerObjectPreTickProcessor<Type extends RoomObject>(
	receiver: Implementation<Type>, fn: TickProcessor<Type>,
) {
	receiver.prototype[PreTick] = fn;
}

export function registerObjectTickProcessor<Type extends RoomObject>(
	receiver: Implementation<Type>, fn: TickProcessor<Type>,
) {
	receiver.prototype[Tick] = fn;
}
