import type { RoomObject } from 'xxscreeps/game/objects/room-object';
import type { Implementation } from 'xxscreeps/util/types';

// `RoomObject` type definitions
const Processors = Symbol('processors');
const Tick = Symbol('tick');
declare module 'xxscreeps/game/objects/room-object' {
	interface RoomObject {
		[Processors]?: {
			[action: string]: (receiver: any, data: any) => boolean;
		};
		[Tick]?: () => boolean;
	}
}

// Register RoomObject intent processor
export function registerActionProcessor<Type extends RoomObject, Action extends string, Data = void>(
	receiver: Implementation<Type>,
	action: Action,
	process: (receiver: Type, data: Data) => boolean,
): void | ((receiver: Type, action: Action) => Data) {
	const processors = receiver.prototype[Processors] = receiver.prototype[Processors] ?? {};
	processors[action] = process;
}
export interface Action {}
type Actions = Exclude<Action[keyof Action], void>;

// Register per-tick per-object processor
export function registerTickProcessor<Type extends RoomObject>(
	receiver: Implementation<Type>,
	tick: (this: Type) => boolean,
) {
	receiver.prototype[Tick] = tick;
}

/*

function save<
	Type extends Parameters<Foo>[0],
	Action extends Parameters<Extract<Foo, (creep: Type, ...args: any[]) => void>>[1],
	Data extends Parameters<Extract<Foo, (creep: Type, action: Action, ...args: any[]) => void>>[2],
>(
	receiver: Type,
	action: Action,
	...data: Data extends undefined ? [] : [ Data ]
) {

}
*/
