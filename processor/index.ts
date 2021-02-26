import type { CounterExtract, Implementation, UnwrapArray } from 'xxscreeps/util/types';
import type { RoomObject } from 'xxscreeps/game/objects/room-object';
import { IntentIdentifier, Processors, Tick } from './symbols';

// `RoomObject` type definitions
type IntentProcessorHolder = Record<string, (receiver: any, ...data: any) => void>;
type IntentIdentifierResult = { group: string; name: string };
type IntentReceiverInstance = {
	[IntentIdentifier]: IntentIdentifierResult;
	[Processors]?: IntentProcessorHolder;
};
declare module 'xxscreeps/game/room' {
	interface Room {
		[Processors]?: IntentProcessorHolder;
	}
}
declare module 'xxscreeps/game/objects/room-object' {
	interface RoomObject {
		[IntentIdentifier]: IntentIdentifierResult;
		[Processors]?: IntentProcessorHolder;
		[Tick]?: (receiver: any) => void;
	}
}

// Custom intents that the IntentManager will accept, but isn't handled by the normal processor pipeline
export type DescribeIntentHandler<Name extends string, Intent extends string, Fn extends (...data: any) => void> =
	Fn extends (...data: infer Data) => void ? { type: Name; intent: Intent; data: Data } : never;

// Register RoomObject intent processor
export function registerIntentProcessor<Type extends IntentReceiverInstance, Intent extends string, Data extends any[]>(
	receiver: Implementation<Type>,
	intent: Intent,
	process: (receiver: Type, ...data: Data) => void,
): void | { type: Type; intent: Intent; data: Data } {
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
export function registerTickProcessor<Type extends RoomObject>(
	receiver: Implementation<Type>,
	tick: (receiver: Type) => void,
) {
	receiver.prototype[Tick] = tick;
}
