import type { ProcessorContext } from './room.js';
import type { RoomObject } from 'xxscreeps/game/object.js';
import type { Room } from 'xxscreeps/game/room/index.js';
import type { CounterExtract, Implementation, UnwrapArray } from 'xxscreeps/utility/types.js';
import type { Intent } from 'xxscreeps:mods/processor';
import { getOrSet } from 'xxscreeps/utility/utility.js';
import { PreTick, Tick, intentProcessorGetters, intentProcessors } from './symbols.js';

export type { ObjectReceivers, RoomIntentPayload, SingleIntent } from './room.js';
export { registerRoomTickProcessor } from './room.js';
export { everyNTicks, registerShardInitializer, registerShardTickProcessor } from './shard.js';
export { hooks } from './symbols.js';

// Intent type definitions
type IntentProcessor = (receiver: any, context: ProcessorContext, ...data: any) => void;
export type IntentProcessorInfo = {
	constraints: {
		after: string[];
		before: string[];
		type: string[];
	};
	intent: string;
	internal: boolean;
	mask: number;
	priority: number;
	process: IntentProcessor;
	receiver: abstract new(...args: any[]) => any;
};
type TickProcessor<Type = any> = (receiver: Type, context: ProcessorContext, next: () => void) => void;
declare module 'xxscreeps/game/object.js' {
	interface RoomObject {
		[PreTick]?: TickProcessor;
		[Tick]?: TickProcessor;
	}
}

// `undefined` is not allowed in intent processors because it JSON serializes to `null`
type AllowedTypes = string | number | boolean | null | AllowedTypes[];
type NullToUndefined<Type> = Type extends null ? undefined | null : Type;
type RemapNull<Type> = Type extends any[] ? {
	[Key in keyof Type]: RemapNull<Type[Key]>;
} : NullToUndefined<Type>;

// Fake type for coalescing registered processors
export interface IntentDeclaration<Type extends object, Intent extends string, Data> {
	type: Type;
	intent: Intent;
	data: Data;
}

// Register RoomObject intent processor
export function registerIntentProcessor<Type extends object, Intent extends string, Data extends AllowedTypes[]>(
	receiver: abstract new(...args: any[]) => Type,
	intent: Intent,
	constraints: {
		after?: string | string[];
		before?: string | string[];
		type?: string | string[];
		internal?: true;
	},
	process: (receiver: Type, context: ProcessorContext, ...data: Data) => void,
): null | IntentDeclaration<Type, Intent, RemapNull<Data>> {
	const toArray = (constraint: string | string[] | undefined) =>
		constraint === undefined ? [] :
		typeof constraint === 'string' ? [ constraint ] : constraint;
	intentProcessors.push({
		constraints: {
			after: toArray(constraints.after),
			before: toArray(constraints.before),
			type: toArray(constraints.type),
		},
		intent,
		internal: constraints.internal ?? false,
		mask: 0,
		priority: 0,
		process,
		receiver,
	});
	return null;
}

// Types for intent processors
type Intents = Exclude<UnwrapArray<Intent[keyof Intent]>, null>;
export type IntentReceivers = Room | Intents['type'];
export type IntentsForReceiver<Type extends IntentReceivers> =
	Type extends any
		? CounterExtract<Intents, IntentDeclaration<Type, any, any>>['intent']
		: never;
export type IntentParameters<Type extends IntentReceivers, Intent extends string> =
	CounterExtract<Intents, IntentDeclaration<Type, Intent, any>>['data'];

type IntentsForHelper<Type extends IntentReceivers> =
	CounterExtract<Intents, IntentDeclaration<Type, any, any>>;

export type IntentListFor<Type extends IntentReceivers> = {
	[Key in IntentsForHelper<Type>['intent']]?: IntentParameters<Type, Key>[];
};

// Register per-tick per-object processor
export function registerObjectPreTickProcessor<Type extends RoomObject>(
	receiver: Implementation<Type>, fn: TickProcessor<Type>,
) {
	registerProcessorField(receiver, PreTick, fn);
}

export function registerObjectTickProcessor<Type extends RoomObject>(
	receiver: Implementation<Type>, fn: TickProcessor<Type>,
) {
	registerProcessorField(receiver, Tick, fn);
}

function registerProcessorField(receiver: Implementation<RoomObject>, field: typeof PreTick | typeof Tick, fn: TickProcessor) {
	receiver.prototype[field] = function() {
		if (Object.hasOwn(receiver.prototype, field)) {
			const next = receiver.prototype[field]!;
			return function(this: RoomObject, receiver, context, afterNext) {
				fn(receiver, context, () => next.call(this, receiver, context, afterNext));
			};
		} else {
			return fn;
		}
	}();

}

export function initializeIntentConstraints() {
	const cmp = (left: IntentProcessorInfo, right: IntentProcessorInfo) => {
		if (
			left.receiver !== right.receiver &&
			!(left.receiver.prototype instanceof right.receiver) &&
			!(right.receiver.prototype instanceof left.receiver)
		) {
			// Intent between unrelated receivers
			return 0;
		}
		if (
			left.constraints.before.includes(right.intent) ||
			right.constraints.after.includes(left.intent)
		) {
			return -1;
		} else if (
			left.constraints.after.includes(right.intent) ||
			right.constraints.before.includes(left.intent)
		) {
			return 1;
		}
		// No relation
		return 0;
	};
	const swap = (ii: number, jj: number) => {
		const tmp = intentProcessors[ii]!;
		intentProcessors[ii] = intentProcessors[jj]!;
		intentProcessors[jj] = tmp;
	};
	const masks = new Map<string, number>();
	const intentProcessorsByName = new Map<string, IntentProcessorInfo[]>();

	// Most intents are not directly comparable with each other, so a modified selection sort is
	// implemented to rank them by relative priority.
	for (let ii = 0; ii < intentProcessors.length; ++ii) {
		let min = ii;
		let end = intentProcessors.length;
		loop: while (true) {
			for (let jj = ii + 1; jj < end; ++jj) {
				if (cmp(intentProcessors[min]!, intentProcessors[jj]!) > 0) {
					swap(min, --end);
					min = jj;
					continue loop;
				}
			}
			break;
		}
		swap(min, ii);
		// Add in calculated data, once per element
		const info = intentProcessors[ii]!;
		info.mask = info.constraints.type.reduce(
			(mask, type) => mask | getOrSet(masks, type, () => 2 ** masks.size),
			0);
		info.priority = ii;
		getOrSet(intentProcessorsByName, info.intent, () => []).push(info);
	}

	// Generate getters
	for (const [ intent, infos ] of intentProcessorsByName) {
		const first = infos[0]!;
		intentProcessorGetters.set(intent, infos.length === 0
			// If there is only one intent with this name the getter is simple
			? () => first :
			// Some unrelated intents share names, but not receivers
			instance => infos.find(info => instance instanceof info.receiver)!);
	}
}
